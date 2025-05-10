const { app, BrowserWindow, Tray, Menu, globalShortcut, clipboard, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Store = require('electron-store');

// Import nut-js modules for Windows keyboard control
let keyboard, Key;
if (process.platform !== 'darwin') {
  try {
    const nutjs = require('@nut-tree-fork/nut-js');
    keyboard = nutjs.keyboard;
    Key = nutjs.Key;
    // Set default delay
    keyboard.config.autoDelayMs = 100;
  } catch (error) {
    console.error('Failed to load nut-js:', error);
  }
}

// This hack helps with macOS app name in menu bar
process.env.ELECTRON_FORCE_WINDOW_MENU_BAR_VISIBLE = false;

// Force rename app to avoid "Electron" in menu bar
app.setName('Pro Translator');
app.name = 'Pro Translator';

// Default application settings
const defaultSettings = {
  apiKey: '',
  targetLanguage: 'persian',
  useDirectIPConnection: false,
  languageModel: 'deepseek/deepseek-prover-v2:free',
  darkMode: true,
  runAtStartup: false,
  keyboardShortcut: {
    modifiers: process.platform === 'darwin' ? ['Control', 'Shift'] : ['Control'],
    key: 'Q'
  }
};

// Settings storage
const store = new Store({
  defaults: defaultSettings
});

// Global variables
let tray = null;
let translationWindow = null;
let settingsWindow = null;
let aboutWindow = null;
let translateNowWindow = null; // Direct translation window
let lastClipboardText = ''; // Store last clipboard text

// Ensure only one instance of the app is running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Configure automatic app startup
function setAutoLaunch(enabled) {
  if (process.platform === 'darwin') {
    // For macOS
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    });
  } else if (process.platform === 'win32') {
    // For Windows
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: []
    });
  } else if (process.platform === 'linux') {
    // For Linux we need to manually create an autostart file
    // but Electron doesn't have a direct API for this
    console.log(`Auto launch setting for Linux: ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  console.log(`Auto launch ${enabled ? 'enabled' : 'disabled'}`);
}

// When the app is ready
app.whenReady().then(() => {
  // For macOS: we need to create a completely minimal menu
  // but with the name Pro Translator
  if (process.platform === 'darwin') {
    // Empty menu with only the absolute essentials
    const template = [
      {
        label: 'Pro Translator',
        submenu: [
          { role: 'quit' }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    
    // Set dock icon if needed
    try {
      const dockIcon = path.join(__dirname, 'build', 'icon.png');
      if (app.dock) {
        app.dock.setIcon(require('electron').nativeImage.createFromPath(dockIcon));
      }
    } catch (error) {
      console.error('Error setting dock icon:', error);
    }
  } else {
    // For Windows/Linux, remove menu completely
    Menu.setApplicationMenu(null);
  }
  
  // For Windows/Linux, remove menu completely
  app.on('browser-window-created', (e, win) => {
    win.setMenu(null);
    win.removeMenu();
  });
  
  // Request necessary permissions for macOS
  if (process.platform === 'darwin') {
    requestMacOSPermissions();
  }
  
  // Set automatic execution based on saved settings
  const runAtStartup = store.get('runAtStartup');
  setAutoLaunch(runAtStartup);
  
  createTray();
  registerShortcut();
  applyDarkMode(); // Apply dark mode at startup
  
  // Add right-click menu for macOS
  if (process.platform === 'darwin') {
    setupContextMenu();
  }
  
  // Get settings from settings window
  ipcMain.on('get-settings', (event) => {
    event.reply('settings-data', store.get());
  });
  
  // Save new settings
  ipcMain.on('save-settings', (event, newSettings) => {
    store.set(newSettings);
    
    // Update keyboard shortcuts if changed
    if (newSettings.keyboardShortcut) {
      globalShortcut.unregisterAll();
      registerShortcut();
    }
    
    // Update automatic execution settings
    if (newSettings.runAtStartup !== undefined) {
      setAutoLaunch(newSettings.runAtStartup);
    }
    
    // Apply dark mode
    applyDarkMode();
    
    event.reply('settings-saved');
  });
  
  // Request new translation
  ipcMain.on('refresh-translation', (event) => {
    console.log('Refresh translation requested');
    translateSelectedText();
  });
  
  // Announce renderer ready
  ipcMain.on('renderer-ready', () => {
    console.log('Renderer process ready');
  });
  
  // Resize translation window based on content
  ipcMain.on('resize-translation-window', (event, data) => {
    if (translationWindow && !translationWindow.isDestroyed()) {
      // Set window height based on text length
      let newHeight = 500; // Base height
      
      if (data && data.contentHeight) {
        // Calculate new height based on content
        newHeight = Math.max(500, Math.min(700, data.contentHeight + 150));
      }
      
      const currentSize = translationWindow.getSize();
      translationWindow.setSize(currentSize[0], newHeight);
      console.log(`Resized translation window to height: ${newHeight}`);
    }
  });
  
  // Add set-always-on-top event handler
  ipcMain.on('set-always-on-top', (event, onTop) => {
    if (translationWindow && !translationWindow.isDestroyed()) {
      translationWindow.setAlwaysOnTop(onTop);
      console.log(`Set translation window always on top: ${onTop}`);
    }
  });
  
  // For macOS: recreate tray icon after closing
  app.on('activate', () => {
    if (tray === null) {
      createTray();
    }
  });
  
  // Process direct translation request
  ipcMain.on('perform-direct-translation', async (event, data) => {
    try {
      console.log(`Direct translation requested for: ${data.text.substring(0, 30)}${data.text.length > 30 ? '...' : ''}`);
      
      const translatedText = await performTranslationRequest(data.text, data.targetLanguage);
      
      if (translateNowWindow && !translateNowWindow.isDestroyed()) {
        translateNowWindow.webContents.send('direct-translation-complete', {
          originalText: data.text,
          translatedText: translatedText
        });
      }
    } catch (error) {
      console.error('Direct translation error:', error);
      
      if (translateNowWindow && !translateNowWindow.isDestroyed()) {
        translateNowWindow.webContents.send('direct-translation-error', {
          error: error.message || 'Translation failed'
        });
      }
    }
  });
});

// Request necessary permissions for macOS
function requestMacOSPermissions() {
  try {
    const { systemPreferences } = require('electron');
    
    // Request accessibility permissions (for keyboard and mouse control)
    if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
      if (!systemPreferences.isTrustedAccessibilityClient(true)) {
        console.log('Requesting accessibility permissions...');
        systemPreferences.isTrustedAccessibilityClient(true);
      } else {
        console.log('App already has accessibility permissions');
      }
    }
    
    // Request full system access
    if (systemPreferences && systemPreferences.setUserDefault) {
      console.log('Setting user defaults for permissions...');
      systemPreferences.setUserDefault('NSApplicationCrashOnExceptions', 'boolean', true);
    }
  } catch (error) {
    console.error(`Error requesting permissions: ${error.message}`);
  }
}

// Create system tray icon and context menu
function createTray() {
  // Default system tray icon
  const nativeImage = require('electron').nativeImage;
  
  // Set up the tray with appropriate icon
  let icon;
  
  if (process.platform === 'darwin') {
    // macOS: Use empty icon with title
    icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setTitle('PT'); // macOS supports setting title text
  } else {
    // Windows: Create a custom black and white PT icon
    icon = nativeImage.createEmpty();
    const size = 16; // Icon size
    
    // Create a new native image by drawing directly to a canvas
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    try {
      // Draw black background
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, size, size);
      
      // Draw white PT text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PT', size/2, size/2);
      
      // Create image from canvas
      icon = nativeImage.createFromDataURL(canvas.toDataURL());
    } catch (error) {
      console.error('Error creating custom tray icon:', error);
      // Fallback to existing icon if creation fails
      const iconPath = path.join(__dirname, 'assets', 'pt-icon-16.ico');
      icon = nativeImage.createFromPath(iconPath);
    }
    
    tray = new Tray(icon);
  }
  
  tray.setToolTip('Pro Translator');

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Translate Selected Text (${process.platform === 'darwin' ? 'Control+Shift+Q' : 'Control+Q'})`,
      click: () => translateSelectedText()
    },
    {
      label: 'Translate Now',
      click: () => openTranslateNow()
    },
    {
      label: 'Test Translation (Hello World)',
      click: () => {
        console.log('Testing translation with "Hello World"');
        // Test text to clipboard
        clipboard.writeText('Hello World');
        // Then start translation
        translateSelectedText();
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => openSettings()
    },
    {
      label: 'About',
      click: () => openAbout()
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  
  // Double-click for selected text translation
  tray.on('double-click', () => {
    translateSelectedText();
  });
}

// Register global keyboard shortcut
function registerShortcut() {
  // Unregister all previously registered shortcuts
  globalShortcut.unregisterAll();
  
  console.log('Registering keyboard shortcuts...');
  
  // Get the custom shortcut from settings
  const settings = store.get();
  const customShortcut = settings.keyboardShortcut || { 
    modifiers: process.platform === 'darwin' ? ['Control', 'Shift'] : ['Control'],
    key: 'Q'
  };
  
  // Build the Electron shortcut string
  const shortcutModifiers = customShortcut.modifiers.map(mod => {
    // Convert CommandOrControl to the platform-specific modifier for proper registration
    if (mod === 'CommandOrControl') {
      return process.platform === 'darwin' ? 'Command' : 'Control';
    }
    return mod;
  });
  
  let shortcutString = shortcutModifiers.join('+') + '+' + customShortcut.key;
  
  // Format shortcut string for electron's globalShortcut
  if (process.platform === 'darwin') {
    // On macOS: Command+Shift+A format
    shortcutString = shortcutString.replace('Command', 'CommandOrControl');
  } else {
    // On Windows: Control+Shift+A format (CommandOrControl converts to Control)
    shortcutString = shortcutString.replace('CommandOrControl', 'Control');
  }
  
  console.log(`Registering main shortcut: ${shortcutString}`);
  
  // Try to register the main shortcut
  let registered = false;
  try {
    registered = globalShortcut.register(shortcutString, () => {
      console.log(`Custom shortcut triggered: ${shortcutString}`);
      
      // Use AppleScript to copy selected text
      if (process.platform === 'darwin') {
        copySelectedTextWithAppleScript()
          .then(() => {
            // After copy, perform translation
            setTimeout(() => translateSelectedText(), 300);
          })
          .catch(error => {
            console.error('Error with AppleScript copy:', error);
            // If AppleScript failed, try to manually translate selected text
            translateSelectedText();
          });
      } else {
        // For non-macOS, use clipboard directly
        translateSelectedText();
      }
    });
    
    if (registered) {
      console.log(`Successfully registered main shortcut: ${shortcutString}`);
    } else {
      console.log(`Failed to register main shortcut: ${shortcutString}`);
    }
  } catch (error) {
    console.error(`Error registering custom shortcut ${shortcutString}: ${error.message}`);
  }
  
  // Additional keyboard shortcuts that don't conflict with most apps
  const alternativeShortcuts = [
    'Command+Shift+D',         // Custom shortcut
    'Command+Shift+1',         // One number combination
    'Command+Option+1',        // Other combination with number
    'Option+Shift+1'           // Simplified combination
  ];
  
  // Try to register all additional shortcuts
  let registeredAny = registered; // Include the custom shortcut status
  let registeredShortcuts = registered ? [shortcutString] : [];
  
  for (const shortcut of alternativeShortcuts) {
    if (shortcut === shortcutString) continue; // Skip if it's the same as custom shortcut
    
    try {
      const shortcutRegistered = globalShortcut.register(shortcut, () => {
        console.log(`Alternative shortcut triggered: ${shortcut}`);
        
        // Use AppleScript to copy selected text
        if (process.platform === 'darwin') {
          copySelectedTextWithAppleScript()
            .then(() => {
              // After copy, perform translation
              setTimeout(() => translateSelectedText(), 300);
            })
            .catch(error => {
              console.error('Error with AppleScript copy:', error);
              // If AppleScript failed, try to manually translate selected text
              translateSelectedText();
            });
        } else {
          // For non-macOS, use clipboard directly
          translateSelectedText();
        }
      });
      
      if (shortcutRegistered) {
        console.log(`Successfully registered alternative shortcut: ${shortcut}`);
        registeredAny = true;
        registeredShortcuts.push(shortcut);
      } else {
        console.log(`Failed to register alternative shortcut: ${shortcut}`);
      }
    } catch (error) {
      console.error(`Error registering shortcut ${shortcut}: ${error.message}`);
    }
  }
  
  if (!registeredAny) {
    console.error('Failed to register any keyboard shortcuts');
  } else {
    console.log(`Active shortcuts: ${registeredShortcuts.join(', ')}`);
  }
  
  // Update context menu with active shortcuts
  updateTrayMenu(registeredShortcuts);
}

// Use AppleScript to copy selected text in MacOS
function copySelectedTextWithAppleScript() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      return reject(new Error('AppleScript is only available on macOS'));
    }
    
    // Set up AppleScript to copy selected text
    const { exec } = require('child_process');
    
    // AppleScript to copy selected text to clipboard
    // This script uses the edit menu of the application
    const appleScript = `
      tell application "System Events"
        tell (name of application processes whose frontmost is true) as text
          keystroke "c" using {command down}
        end tell
      end tell
    `;
    
    console.log('Executing AppleScript to copy selected text...');
    
    exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
      if (error) {
        console.log(`AppleScript error: ${error.message}. Trying menu method...`);
        
        // Alternative method: Use application menu to copy
        const alternativeScript = `
          tell application "System Events"
            tell (first process whose frontmost is true)
              tell menu bar 1
                tell menu bar item "Edit"
                  tell menu "Edit"
                    click menu item "Copy"
                  end tell
                end tell
              end tell
            end tell
          end tell
        `;
        
        exec(`osascript -e '${alternativeScript}'`, (altError, altStdout, altStderr) => {
          if (altError) {
            console.error(`Alternative AppleScript error: ${altError.message}`);
            // Continue with existing clipboard content
            setTimeout(resolve, 200);
          } else {
            console.log('Alternative AppleScript executed successfully');
            setTimeout(resolve, 300);
          }
        });
      } else {
        console.log('AppleScript executed successfully');
        // Wait a bit for text to be copied to clipboard
        setTimeout(resolve, 300);
      }
    });
  });
}

// Update system tray menu with active shortcuts
function updateTrayMenu(activeShortcuts = []) {
  if (!tray) return;
  
  // Display active shortcuts in menu
  let shortcutDisplay = activeShortcuts.length > 0 
    ? activeShortcuts[0] 
    : process.platform === 'darwin' ? 'Control+Shift+Q' : 'Control+Q';
  
  // Create new menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Translate Selected Text (${shortcutDisplay})`,
      click: () => {
        if (process.platform === 'darwin') {
          copySelectedTextWithAppleScript()
            .then(() => setTimeout(() => translateSelectedText(), 300))
            .catch(() => translateSelectedText());
        } else {
          translateSelectedText();
        }
      }
    },
    {
      label: 'Translate Now',
      click: () => openTranslateNow()
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => openSettings()
    },
    {
      label: 'About',
      click: () => openAbout()
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  
  // Double-click for selected text translation
  tray.on('double-click', () => {
    translateSelectedText();
  });
}

// Add a stronger function for accessing clipboard text
function getClipboardText() {
  let text = '';
  
  // Try different methods to read clipboard
  try {
    // Electron method to read clipboard
    if (clipboard && clipboard.readText) {
      text = clipboard.readText();
      if (text) {
        console.log(`Successfully read from clipboard using electron clipboard API: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);
        return text.trim();
      }
    }
    
    // Fallback method
    if (process.platform === 'darwin') {
      try {
        // Test content to ensure clipboard access is working
        const fallbackContent = 'This is a fallback test content';
        clipboard.writeText(fallbackContent);
        const newReadText = clipboard.readText();
        
        if (newReadText === fallbackContent) {
          console.log('Successfully wrote and read from clipboard - clipboard access is working');
        } else {
          console.warn(`Clipboard write/read mismatch - expected "${fallbackContent}" but got "${newReadText}"`);
        }
      } catch (innerError) {
        console.error(`Fallback clipboard test failed: ${innerError.message}`);
      }
    }
  } catch (error) {
    console.error(`Error reading clipboard: ${error.message}`);
  }
  
  return text.trim();
}

// Send translation request to API and get translation
async function translateSelectedText(event, atPosition = null) {
  try {
    // Copy selected text to clipboard
    if (process.platform === 'darwin') {
      await copySelectedTextWithAppleScript();
    } else {
      // For Windows/Linux, use Ctrl+C
      await keyboard.pressKey(Key.LeftControl, Key.C);
      await keyboard.releaseKey(Key.LeftControl, Key.C);
    }
    
    // Wait a bit for text to be saved to clipboard
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Read text from clipboard
    const text = getClipboardText();
    
    // If text is empty or same as previous, don't translate
    if (!text || text.trim() === '' || text === lastClipboardText) {
      console.log('No new text to translate');
      return;
    }
    
    // Save current text for next comparison
    lastClipboardText = text;
    
    console.log(`Translating: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);
    
    // Create translation window if needed
    if (!translationWindow || translationWindow.isDestroyed()) {
      createTranslationWindow(atPosition);
      
      // Wait for window to be fully created
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      translationWindow.show();
    }
    
    // Send text to translation window
    sendTextToTranslationWindow(text);
    
    // Translation settings
    const settings = store.get();
    
    try {
      // Translate text
      const translatedText = await performTranslationRequest(text, settings.targetLanguage);
      
      // Send translation result to window
      if (translationWindow && !translationWindow.isDestroyed()) {
        translationWindow.webContents.send('translation-complete', {
          translatedText: translatedText
        });
      }
    } catch (error) {
      console.error(`Translation error: ${error.message}`);
      
      if (translationWindow && !translationWindow.isDestroyed()) {
        translationWindow.webContents.send('translation-error', {
          error: error.message || 'Translation failed'
        });
      }
    }
  } catch (error) {
    console.error(`Translation process error: ${error}`);
  }
}

// Send text to translation window
function sendTextToTranslationWindow(text) {
  if (!text || !translationWindow) return;
  
  try {
    console.log('Sending text to translation window');
    translationWindow.webContents.send('start-translation', { text });
    
    // Send translation request to API
    performTranslationRequest(text)
      .then(translation => {
        if (translationWindow && !translationWindow.isDestroyed()) {
          translationWindow.webContents.send('translation-complete', {
            originalText: text,
            translatedText: translation
          });
          
          // Check settings for vocabulary learning
          const settings = store.get();
          if (settings.activeLearnVocabulary) {
            translationWindow.webContents.send('vocabulary-loading');
            
            fetchDifficultWords(text, settings)
              .then(vocabulary => {
                if (translationWindow && !translationWindow.isDestroyed()) {
                  translationWindow.webContents.send('vocabulary-complete', { vocabulary });
                }
              })
              .catch(error => {
                console.error('Vocabulary error:', error);
                if (translationWindow && !translationWindow.isDestroyed()) {
                  translationWindow.webContents.send('vocabulary-error');
                }
              });
          }
        }
      })
      .catch(error => {
        console.error('Translation error:', error);
        if (translationWindow && !translationWindow.isDestroyed()) {
          translationWindow.webContents.send('translation-error', { 
            error: error.message || 'Translation failed' 
          });
        }
      });
  } catch (error) {
    console.error(`Error sending to translation window: ${error.message}`);
  }
}

// Function to create a browser window with appropriate options
function createWindow(options) {
  const defaults = {
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  };
  
  const windowOptions = { ...defaults, ...options };
  const window = new BrowserWindow(windowOptions);
  
  // Remove menu completely
  window.removeMenu();
  window.setMenu(null);
  
  // Handle window close event - hide only, not close
  window.on('close', (event) => {
    // Prevent closing if app is not fully quitting
    if (!app.isQuitting) {
      event.preventDefault();
      window.hide();
      return false;
    }
    return true;
  });
  
  return window;
}

// Create translation window
function createTranslationWindow() {
  if (translationWindow) {
    translationWindow.show();
    return translationWindow;
  }
  
  translationWindow = createWindow({
    width: 520,
    height: 500,
    show: false,
    frame: true,
    resizable: true,
    fullscreenable: false,
    title: 'Translation',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Check for translation.html file
  const translationHtmlPath = path.join(__dirname, 'renderer', 'translation.html');
  console.log(`Loading translation window from: ${translationHtmlPath}`);
  
  try {
    translationWindow.loadFile(translationHtmlPath);
    
    translationWindow.once('ready-to-show', () => {
      translationWindow.show();
    });

    translationWindow.on('closed', () => {
      translationWindow = null;
    });
    
    // Check for potential errors
    translationWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Failed to load translation window: ${errorDescription} (${errorCode})`);
    });
    
    return translationWindow;
  } catch (error) {
    console.error(`Error creating translation window: ${error.message}`);
    if (translationWindow) {
      translationWindow.close();
      translationWindow = null;
    }
    return null;
  }
}

// Open settings window
function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = createWindow({
    width: 480,
    height: 600,
    title: 'Pro Translator Settings',
    resizable: true
  });

  // Check for settings.html file
  const settingsHtmlPath = path.join(__dirname, 'renderer', 'settings.html');
  console.log(`Loading settings window from: ${settingsHtmlPath}`);
  
  try {
    settingsWindow.loadFile(settingsHtmlPath);
    
    // Check for potential errors
    settingsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Failed to load settings window: ${errorDescription} (${errorCode})`);
    });
    
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  } catch (error) {
    console.error(`Error creating settings window: ${error.message}`);
    if (settingsWindow) {
      settingsWindow.close();
      settingsWindow = null;
    }
  }
}

// Open about window
function openAbout() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  
  aboutWindow = createWindow({
    width: 300,
    height: 280,
    title: 'About Pro Translator',
    resizable: false
  });

  // Check for about.html file
  const aboutHtmlPath = path.join(__dirname, 'renderer', 'about.html');
  console.log(`Loading about window from: ${aboutHtmlPath}`);
  
  try {
    aboutWindow.loadFile(aboutHtmlPath);
    
    // Check for potential errors
    aboutWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Failed to load about window: ${errorDescription} (${errorCode})`);
    });
    
    aboutWindow.on('closed', () => {
      aboutWindow = null;
    });
  } catch (error) {
    console.error(`Error creating about window: ${error.message}`);
    if (aboutWindow) {
      aboutWindow.close();
      aboutWindow = null;
    }
  }
}

// Create direct translation window
function openTranslateNow() {
  if (translateNowWindow) {
    translateNowWindow.focus();
    return;
  }
  
  translateNowWindow = createWindow({
    width: 850,
    height: 600,
    title: 'Translate Now',
    resizable: true
  });

  // Check for translate-now.html file
  const translateNowHtmlPath = path.join(__dirname, 'renderer', 'translate-now.html');
  console.log(`Loading translate-now window from: ${translateNowHtmlPath}`);
  
  try {
    translateNowWindow.loadFile(translateNowHtmlPath);
    
    // Check for potential errors
    translateNowWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Failed to load translate-now window: ${errorDescription} (${errorCode})`);
    });
    
    translateNowWindow.on('closed', () => {
      translateNowWindow = null;
    });
    
    // Send settings to window
    translateNowWindow.webContents.once('did-finish-load', () => {
      translateNowWindow.webContents.send('load-settings', store.get());
    });
    
    // Apply dark mode
    const settings = store.get();
    if (settings.darkMode) {
      translateNowWindow.webContents.send('set-dark-mode', true);
    }
  } catch (error) {
    console.error(`Error creating translate-now window: ${error.message}`);
    if (translateNowWindow) {
      translateNowWindow.close();
      translateNowWindow = null;
    }
  }
}

// Send translation request to API
async function performTranslationRequest(text, targetLang = null) {
  const settings = store.get();
  
  // Ensure API key is valid
  if (!settings.apiKey || settings.apiKey.trim() === '') {
    throw new Error('Please set a valid API key in settings');
  }
  
  // Determine target language for translation
  const targetLanguage = targetLang || settings.targetLanguage || 'persian';
  
  // Determine API URL based on direct connection settings
  const apiUrl = settings.useDirectIPConnection 
    ? 'https://198.143.1.89/api/v1/chat/completions' 
    : 'https://openrouter.ai/api/v1/chat/completions';
  
  // Input message for translation
  const userMessage = `Please translate the following text to ${targetLanguage}.
  IMPORTANT: Return ONLY the raw translated text with no formatting, no code blocks, no backticks, no quotes, and no other symbols surrounding it.
  Text: ${text}`;
  
  // Build request body
  const requestBody = {
    model: settings.languageModel,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  };
  
  try {
    // Send request
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      timeout: 30000 // 30 seconds timeout
    });
    
    // Extract translated text
    if (response.data && 
        response.data.choices && 
        response.data.choices.length > 0 && 
        response.data.choices[0].message &&
        response.data.choices[0].message.content) {
      // Remove markdown blockquotes from response
      let translatedText = response.data.choices[0].message.content;
      
      // Remove ``` from start and end of response
      translatedText = translatedText.replace(/^```[\s\S]*?```$/g, function(match) {
        // Remove first and last lines which contain ```
        const lines = match.split('\n');
        if (lines.length >= 3) {
          return lines.slice(1, -1).join('\n');
        }
        return match.replace(/```/g, '');
      });
      
      // Remove any remaining ```
      translatedText = translatedText.replace(/```/g, '');
      
      return translatedText.trim();
    } else {
      throw new Error('Invalid response format from translation API');
    }
  } catch (error) {
    console.error('Translation API error:', error);
    
    if (error.response) {
      // HTTP error received from server
      throw new Error(`Server error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
    } else if (error.request) {
      // Sent request but no response received
      throw new Error('No response received from translation server. Please check your internet connection.');
    } else {
      // Error in request setup
      throw new Error(`Error: ${error.message}`);
    }
  }
}

// Extract important words and synonyms
async function fetchDifficultWords(text, settings) {
  // If vocabulary learning is not active, no need to proceed
  if (!settings.activeLearnVocabulary) {
    return '';
  }
  
  const apiUrl = settings.useDirectIPConnection 
    ? 'https://198.143.1.89/api/v1/chat/completions' 
    : 'https://openrouter.ai/api/v1/chat/completions';
  
  // Build prompt for extracting vocabulary
  const prompt = `extract important words from below text based on ielts ${settings.ieltsLevel} and write maximum 4 synonyms for each word based on this structure: 
[{"originalWord":X,"synonyms":[Y,Z,Y,M]}]
text: ${text}`;
  
  const requestBody = {
    model: settings.languageModel,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: "json_object" }
  };
  
  try {
    // Send request
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      timeout: 30000
    });
    
    // Extract response content
    if (response.data && 
        response.data.choices && 
        response.data.choices.length > 0 && 
        response.data.choices[0].message &&
        response.data.choices[0].message.content) {
      
      // Process JSON and extract vocabulary terms
      const content = response.data.choices[0].message.content;
      return extractVocabularyTerms(content);
    } else {
      throw new Error('Invalid response format from vocabulary API');
    }
  } catch (error) {
    console.error('Vocabulary API error:', error);
    throw error;
  }
}

// Extract vocabulary terms and synonyms from JSON response
function extractVocabularyTerms(jsonString) {
  try {
    // Clean JSON string
    let cleanJsonString = jsonString.trim();
    
    // Remove markdown blockquotes
    if (cleanJsonString.startsWith('```')) {
      const lines = cleanJsonString.split('\n');
      if (lines.length > 2) {
        cleanJsonString = lines.slice(1, -1).join('\n');
      }
    }
    
    // Parse JSON
    const jsonObj = JSON.parse(cleanJsonString);
    
    let terms = [];
    
    // Process array
    if (Array.isArray(jsonObj)) {
      terms = jsonObj.map(term => {
        const word = term.originalWord || term.orginalWord;
        const synonyms = term.synonyms || [];
        return `${word}: ${synonyms.join(', ')}`;
      });
    } 
    // Process object with key (like difficult_words)
    else if (typeof jsonObj === 'object') {
      for (const key in jsonObj) {
        if (Array.isArray(jsonObj[key])) {
          const items = jsonObj[key];
          terms = items.map(term => {
            const word = term.originalWord || term.orginalWord;
            const synonyms = term.synonyms || [];
            return `${word}: ${synonyms.join(', ')}`;
          });
        }
      }
    }
    
    return terms.join('\n');
  } catch (error) {
    console.error('Error parsing vocabulary JSON:', error);
    return jsonString; // Return original string in case of error
  }
}

// Manage IPC events
ipcMain.on('translate-text', (event, data) => {
  translateSelectedText(event, data.position);
});

ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});

// Keep app running in memory even if all windows are closed
app.on('window-all-closed', () => {
  // On macOS, apps usually stay in dock until user Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Unregister shortcuts when quitting app
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Set right-click menu for macOS
function setupContextMenu() {
  try {
    console.log('Setting up macOS context menu');
    const { systemPreferences } = require('electron');
    
    // Ensure access to clipboard
    if (systemPreferences && systemPreferences.askForMediaAccess) {
      systemPreferences.askForMediaAccess('microphone');
    }
  } catch (error) {
    console.error(`Error setting up context menu: ${error.message}`);
  }
}

// Apply dark mode settings to windows
function applyDarkMode() {
  const settings = store.get();
  const isDarkMode = settings.darkMode || false;
  
  // Set macOS title bar color
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('force-dark-mode', isDarkMode);
  }
  
  // Apply changes to existing windows
  if (translationWindow && !translationWindow.isDestroyed()) {
    translationWindow.webContents.send('set-dark-mode', isDarkMode);
  }
  
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('set-dark-mode', isDarkMode);
  }
  
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.webContents.send('set-dark-mode', isDarkMode);
  }
  
  // Set dark mode for new windows
  app.on('browser-window-created', (_, window) => {
    window.webContents.send('set-dark-mode', isDarkMode);
  });
}

// Flag for controlling window behavior before quitting
app.isQuitting = false;

// Set quit behavior before closing app
ipcMain.on('quit-app', () => {
  app.isQuitting = true;
  app.quit();
}); 