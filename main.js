const { app, BrowserWindow, Tray, Menu, globalShortcut, clipboard, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Store = require('electron-store');
const os = require('os');

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

// Log functions need to be defined before being used elsewhere
// Get log file path
function getLogFilePath() {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'log.txt');
  } catch (error) {
    // If we can't get the user path, use the temp directory
    console.error('Failed to get user data path:', error);
    return path.join(os.tmpdir(), 'pro-translator-log.txt');
  }
}

// Log data to file
function logToFile(level, message) {
  try {
    const logPath = getLogFilePath();
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} [${level}] ${message}\n`;
    
    // Using writeFile instead of appendFileSync for non-blocking operation
    fs.writeFile(logPath, logLine, { flag: 'a' }, (err) => {
      if (err) {
        // If an error occurs, only display it in the console
        console.error(`Failed to write to log: ${err.message}`);
      }
    });
  } catch (error) {
    // If we can't write to the log, display the error in the console
    console.error(`Failed to write to log: ${error.message}`);
  }
}

// Create safer logging functions
const safeConsole = {
  log: function(...args) {
    try {
      console.log(...args);
      // Using non-blocking version of logging
      setTimeout(() => {
        try {
          logToFile('INFO', args.join(' '));
        } catch (error) {
          console.error('Error in async logging:', error);
        }
      }, 0);
    } catch (error) {
      // Silently fail if console logging fails
      console.error('Error in safeConsole.log:', error);
    }
  },
  error: function(...args) {
    try {
      console.error(...args);
      // Using non-blocking version of logging
      setTimeout(() => {
        try {
          logToFile('ERROR', args.join(' '));
        } catch (error) {
          console.error('Error in async logging:', error);
        }
      }, 0);
    } catch (error) {
      // Silently fail if console logging fails
      console.error('Error in safeConsole.error:', error);
    }
  },
  warn: function(...args) {
    try {
      console.warn(...args);
      // Using non-blocking version of logging
      setTimeout(() => {
        try {
          logToFile('WARN', args.join(' '));
        } catch (error) {
          console.error('Error in async logging:', error);
        }
      }, 0);
    } catch (error) {
      // Silently fail if console logging fails
      console.error('Error in safeConsole.warn:', error);
    }
  }
};

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
  },
  languageToolsShortcut: {
    modifiers: process.platform === 'darwin' ? ['Control', 'Shift'] : ['Control'],
    key: 'L'
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
let watchdogTimer = null; // Timer to detect application freezes
let applicationStartTime = Date.now(); // Track when the application started

// Flags to track window states
let isTranslationWindowDestroyed = true;
let isSettingsWindowDestroyed = true;
let isAboutWindowDestroyed = true;
let isTranslateNowWindowDestroyed = true;

// Variable to detect development environment
const isDevelopment = process.argv.includes('--dev') || process.argv.includes('--disable-auto-reload');

// Ensure only one instance of the app is running - modified for development environment
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  safeConsole.log('Another instance is already running. Quitting this instance.');
  app.quit();
  return;
}

// Set development behavior if needed
if (isDevelopment) {
  safeConsole.log('Running in development mode. Auto-reload is disabled.');
  // Disable automatic file reloading on change
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  
  // Log command line arguments for debugging
  safeConsole.log('Command line arguments:', process.argv.join(', '));
}

// Handle attempt to open a second instance
app.on('second-instance', (event, commandLine, workingDirectory) => {
  safeConsole.log('Second instance detected, focusing the existing window.');
  
  // Focus the main window if it exists
  if (translationWindow && !isTranslationWindowDestroyed) {
    if (translationWindow.isMinimized()) translationWindow.restore();
    translationWindow.focus();
  } else if (translateNowWindow && !isTranslateNowWindowDestroyed) {
    if (translateNowWindow.isMinimized()) translateNowWindow.restore();
    translateNowWindow.focus();
  } else {
    // If no windows are open, create one
    createTranslationWindow();
  }
});

// Ensure the app quits properly when closing
app.on('before-quit', () => {
  safeConsole.log('Application is quitting...');
  cleanupAndExit();
});

// Collect system information
function collectSystemInfo() {
  try {
    const info = {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      osVersion: os.release(),
      osArch: os.arch(),
      systemMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
      freeMemory: `${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`,
      cpuModel: os.cpus()[0].model,
      cpuCores: os.cpus().length
    };
    
    return Object.entries(info)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  } catch (error) {
    return `Failed to collect system info: ${error.message}`;
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  try {
    const errorDetails = error.stack || error.toString();
    const systemInfo = collectSystemInfo();
    
    const crashReport = [
      '===== PRO TRANSLATOR CRASH REPORT =====',
      `Timestamp: ${new Date().toISOString()}`,
      '\n=== ERROR DETAILS ===',
      errorDetails,
      '\n=== SYSTEM INFORMATION ===',
      systemInfo,
      '\n=== END OF CRASH REPORT ===',
      '\nPlease send this file to mortezadalil@gmail.com for assistance.\n'
    ].join('\n');
    
    // Display error in console
    console.error('Application crashed. Details:');
    console.error(crashReport);
    
    // Try to write crash report to log file in a non-blocking manner
    try {
      const logPath = getLogFilePath();
      fs.writeFile(logPath, crashReport, (writeErr) => {
        if (writeErr) {
          console.error(`Failed to write crash report to ${logPath}: ${writeErr.message}`);
          
          // Try writing to temp path if writing to the main path fails
          const tempLogPath = path.join(os.tmpdir(), 'pro-translator-crash.log');
          fs.writeFile(tempLogPath, crashReport, (tempWriteErr) => {
            if (tempWriteErr) {
              console.error(`Also failed to write to temp location ${tempLogPath}: ${tempWriteErr.message}`);
            } else {
              console.error(`Crash report saved to temporary location: ${tempLogPath}`);
            }
          });
        }
      });
    } catch (fileError) {
      console.error(`Error accessing log file: ${fileError.message}`);
    }
    
    // If we can, try to show an error notification
    if (app.isReady()) {
      try {
        const crashWindow = new BrowserWindow({
          width: 400,
          height: 300,
          alwaysOnTop: true,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        
        // Construct the HTML for the error message
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Pro Translator Crash</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
              padding: 20px;
              color: #333;
            }
            h2 {
              color: #d32f2f;
            }
            .log-path {
              background: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <h2>Pro Translator has crashed</h2>
          <p>The application encountered a problem and needs to close.</p>
          <p>A crash log has been saved.</p>
          <p>Please send the log file to: <a href="mailto:mortezadalil@gmail.com">mortezadalil@gmail.com</a></p>
          <div class="error-details">
            <h3>Error Details:</h3>
            <pre>${error.message}</pre>
          </div>
        </body>
        </html>
        `;
        
        // Load the HTML
        crashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      } catch (windowError) {
        console.error('Failed to create crash window:', windowError);
      }
    }
  } catch (finalError) {
    // Last resort - if even our crash handler crashes
    console.error('Failed to handle crash:', finalError);
  }
});

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
    safeConsole.log(`Auto launch setting for Linux: ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  safeConsole.log(`Auto launch ${enabled ? 'enabled' : 'disabled'}`);
}

// When the app is ready
app.whenReady().then(() => {
  try {
    safeConsole.log('Application starting up...');
    
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
          // Hide dock icon by default for menubar app
          app.dock.hide();
        }
      } catch (error) {
        safeConsole.error('Error setting dock icon:', error);
      }
    } else {
      // For Windows/Linux, remove menu completely
      Menu.setApplicationMenu(null);
    }
    
    // For Windows/Linux, remove menu completely
    app.on('browser-window-created', (e, win) => {
      win.removeMenu();
    });
    
    // Request necessary permissions for macOS
    if (process.platform === 'darwin') {
      requestMacOSPermissions();
    }
    
    // Set automatic execution based on saved settings
    const runAtStartup = store.get('runAtStartup');
    setAutoLaunch(runAtStartup);
    
    // Initialize the tray icon first
    createTray();
    
    // Then register keyboard shortcuts
    registerShortcut();
    
    // Apply theme settings
    applyDarkMode();
    
    // Add right-click menu for macOS
    if (process.platform === 'darwin') {
      setupContextMenu();
    }
    
    // IPC Event Handlers
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
      safeConsole.log('Refresh translation requested');
      translateSelectedText();
    });
    
    // Announce renderer ready
    ipcMain.on('renderer-ready', () => {
      safeConsole.log('Renderer process ready');
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
        safeConsole.log(`Resized translation window to height: ${newHeight}`);
      }
    });
    
    // Add set-always-on-top event handler
    ipcMain.on('set-always-on-top', (event, onTop) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.setAlwaysOnTop(onTop);
        safeConsole.log(`Set window always on top: ${onTop}`);
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
        safeConsole.log(`Direct translation requested for: ${data.text.substring(0, 30)}${data.text.length > 30 ? '...' : ''}`);
        
        const translatedText = await performTranslationRequest(data.text, data.targetLanguage);
        
        if (translateNowWindow && !translateNowWindow.isDestroyed()) {
          translateNowWindow.webContents.send('direct-translation-complete', {
            originalText: data.text,
            translatedText: translatedText,
            isRephrasely: data.isRephrasely || false
          });
        }
      } catch (error) {
        safeConsole.error('Direct translation error:', error);
        
        if (translateNowWindow && !translateNowWindow.isDestroyed()) {
          translateNowWindow.webContents.send('direct-translation-error', {
            error: error.message || 'Translation failed'
          });
        }
      }
    });
    
    // Setup application watchdog to detect and recover from hangs
    setupWatchdog();
    
    safeConsole.log('Application started successfully');
  } catch (error) {
    safeConsole.error('Error during application startup:', error);
    // Attempt graceful shutdown if startup fails
    app.quit();
  }
});

// Request necessary permissions for macOS
function requestMacOSPermissions() {
  try {
    const { systemPreferences } = require('electron');
    
    // Request accessibility permissions (for keyboard and mouse control)
    if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
      if (!systemPreferences.isTrustedAccessibilityClient(true)) {
        safeConsole.log('Requesting accessibility permissions...');
        systemPreferences.isTrustedAccessibilityClient(true);
      } else {
        safeConsole.log('App already has accessibility permissions');
      }
    }
    
    // Request full system access
    if (systemPreferences && systemPreferences.setUserDefault) {
      safeConsole.log('Setting user defaults for permissions...');
      systemPreferences.setUserDefault('NSApplicationCrashOnExceptions', 'boolean', true);
    }
  } catch (error) {
    safeConsole.error(`Error requesting permissions: ${error.message}`);
  }
}

// Create system tray icon and context menu
function createTray() {
  // First, destroy any existing tray to prevent duplicate icons
  if (tray !== null) {
    try {
      tray.destroy();
      tray = null;
      safeConsole.log('Existing tray destroyed before creating a new one');
    } catch (error) {
      safeConsole.error('Error destroying existing tray:', error);
    }
  }
  
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
      safeConsole.error('Error creating custom tray icon:', error);
      // Fallback to existing icon if creation fails
      const iconPath = path.join(__dirname, 'assets', 'pt-icon-16.ico');
      icon = nativeImage.createFromPath(iconPath);
    }
    
    tray = new Tray(icon);
  }
  
  // If tray creation failed, log error and exit this function
  if (!tray) {
    safeConsole.error('Failed to create tray icon');
    return;
  }
  
  tray.setToolTip('Pro Translator');

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Translate Selected Text (${process.platform === 'darwin' ? 'Control+Shift+Q' : 'Control+Q'})`,
      click: () => translateSelectedText()
    },
    {
      label: 'Language Tools',
      click: () => openTranslateNow()
    },
    {
      label: 'Test Translation (Hello World)',
      click: () => {
        safeConsole.log('Testing translation with "Hello World"');
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
  
  safeConsole.log('Registering keyboard shortcuts...');
  
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
  
  safeConsole.log(`Registering main shortcut: ${shortcutString}`);
  
  // Try to register the main shortcut
  let registered = false;
  try {
    registered = globalShortcut.register(shortcutString, () => {
      safeConsole.log(`Custom shortcut triggered: ${shortcutString}`);
      
      // Use AppleScript to copy selected text
      if (process.platform === 'darwin') {
        copySelectedTextWithAppleScript()
          .then(() => {
            // After copy, perform translation
            setTimeout(() => translateSelectedText(), 300);
          })
          .catch(error => {
            safeConsole.error('Error with AppleScript copy:', error);
            // If AppleScript failed, try to manually translate selected text
            translateSelectedText();
          });
      } else {
        // For non-macOS, use clipboard directly
        translateSelectedText();
      }
    });
    
    if (registered) {
      safeConsole.log(`Successfully registered main shortcut: ${shortcutString}`);
    } else {
      safeConsole.log(`Failed to register main shortcut: ${shortcutString}`);
    }
  } catch (error) {
    safeConsole.error(`Error registering custom shortcut ${shortcutString}: ${error.message}`);
  }
  
  // Register Language Tools shortcut
  const languageToolsShortcut = settings.languageToolsShortcut || { 
    modifiers: process.platform === 'darwin' ? ['Control', 'Shift'] : ['Control'],
    key: 'L'
  };
  
  // Build the Language Tools shortcut string
  const ltShortcutModifiers = languageToolsShortcut.modifiers.map(mod => {
    // Convert CommandOrControl to the platform-specific modifier for proper registration
    if (mod === 'CommandOrControl') {
      return process.platform === 'darwin' ? 'Command' : 'Control';
    }
    return mod;
  });
  
  let ltShortcutString = ltShortcutModifiers.join('+') + '+' + languageToolsShortcut.key;
  
  // Format shortcut string for electron's globalShortcut
  if (process.platform === 'darwin') {
    // On macOS: Command+Shift+L format
    ltShortcutString = ltShortcutString.replace('Command', 'CommandOrControl');
  } else {
    // On Windows: Control+Shift+L format (CommandOrControl converts to Control)
    ltShortcutString = ltShortcutString.replace('CommandOrControl', 'Control');
  }
  
  safeConsole.log(`Registering Language Tools shortcut: ${ltShortcutString}`);
  
  // Try to register the Language Tools shortcut
  let ltRegistered = false;
  try {
    ltRegistered = globalShortcut.register(ltShortcutString, () => {
      safeConsole.log(`Language Tools shortcut triggered: ${ltShortcutString}`);
      openTranslateNow();
    });
    
    if (ltRegistered) {
      safeConsole.log(`Successfully registered Language Tools shortcut: ${ltShortcutString}`);
      registered = registered || ltRegistered; // Count as successful if either shortcut registers
    } else {
      safeConsole.log(`Failed to register Language Tools shortcut: ${ltShortcutString}`);
    }
  } catch (error) {
    safeConsole.error(`Error registering Language Tools shortcut ${ltShortcutString}: ${error.message}`);
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
        safeConsole.log(`Alternative shortcut triggered: ${shortcut}`);
        
        // Use AppleScript to copy selected text
        if (process.platform === 'darwin') {
          copySelectedTextWithAppleScript()
            .then(() => {
              // After copy, perform translation
              setTimeout(() => translateSelectedText(), 300);
            })
            .catch(error => {
              safeConsole.error('Error with AppleScript copy:', error);
              // If AppleScript failed, try to manually translate selected text
              translateSelectedText();
            });
        } else {
          // For non-macOS, use clipboard directly
          translateSelectedText();
        }
      });
      
      if (shortcutRegistered) {
        safeConsole.log(`Successfully registered alternative shortcut: ${shortcut}`);
        registeredAny = true;
        registeredShortcuts.push(shortcut);
      } else {
        safeConsole.log(`Failed to register alternative shortcut: ${shortcut}`);
      }
    } catch (error) {
      safeConsole.error(`Error registering shortcut ${shortcut}: ${error.message}`);
    }
  }
  
  if (!registeredAny) {
    safeConsole.error('Failed to register any keyboard shortcuts');
  } else {
    safeConsole.log(`Active shortcuts: ${registeredShortcuts.join(', ')}`);
  }
  
  // Update context menu with active shortcuts
  updateTrayMenu(registeredShortcuts);
}

// Use AppleScript to copy selected text in MacOS
function copySelectedTextWithAppleScript() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      return resolve(''); // Just resolve with empty string on non-macOS platforms
    }
    
    try {
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
      
      safeConsole.log('Executing AppleScript to copy selected text...');
      
      exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
          safeConsole.log(`AppleScript error: ${error.message}. Trying menu method...`);
          
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
          
          try {
            exec(`osascript -e '${alternativeScript}'`, (altError, altStdout, altStderr) => {
              if (altError) {
                safeConsole.error(`Alternative AppleScript error: ${altError.message}`);
                // Continue with existing clipboard content instead of failing
                return resolve('');
              } else {
                safeConsole.log('Alternative AppleScript executed successfully');
                setTimeout(() => resolve(''), 300);
              }
            });
          } catch (execError) {
            safeConsole.error('Failed to execute alternative AppleScript:', execError);
            return resolve('');
          }
        } else {
          safeConsole.log('AppleScript executed successfully');
          // Wait a bit for text to be copied to clipboard
          setTimeout(() => resolve(''), 300);
        }
      });
    } catch (e) {
      safeConsole.error('Exception in copySelectedTextWithAppleScript:', e);
      resolve(''); // Resolve with empty string in case of any error
    }
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
      label: 'Language Tools',
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
      try {
        text = clipboard.readText();
        if (text) {
          safeConsole.log(`Successfully read from clipboard using electron clipboard API: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);
          return text.trim();
        }
      } catch (e) {
        safeConsole.error(`Error in clipboard.readText(): ${e.message}`);
        // Continue to fallback methods
      }
    }
    
    // Fallback method
    if (process.platform === 'darwin') {
      try {
        // Test content to ensure clipboard access is working
        const fallbackContent = 'This is a fallback test content';
        try {
          clipboard.writeText(fallbackContent);
          try {
            const newReadText = clipboard.readText();
            
            if (newReadText === fallbackContent) {
              safeConsole.log('Successfully wrote and read from clipboard - clipboard access is working');
            } else {
              safeConsole.warn(`Clipboard write/read mismatch - expected "${fallbackContent}" but got "${newReadText}"`);
            }
          } catch (readError) {
            safeConsole.error(`Fallback clipboard read failed: ${readError.message}`);
          }
        } catch (writeError) {
          safeConsole.error(`Fallback clipboard write failed: ${writeError.message}`);
        }
      } catch (innerError) {
        safeConsole.error(`Fallback clipboard test failed: ${innerError.message}`);
      }
    }
  } catch (error) {
    safeConsole.error(`Error reading clipboard: ${error.message}`);
  }
  
  return text.trim();
}

// Send translation request to API and get translation
async function translateSelectedText(event, atPosition = null) {
  try {
    let text = '';
    
    // Copy selected text to clipboard
    if (process.platform === 'darwin') {
      await copySelectedTextWithAppleScript();
      // Wait a bit for text to be saved to clipboard
      await new Promise(resolve => setTimeout(resolve, 300));
      text = getClipboardText();
    } else {
      try {
        // For Windows/Linux, use Ctrl+C
        await keyboard.pressKey(Key.LeftControl, Key.C);
        await keyboard.releaseKey(Key.LeftControl, Key.C);
        // Wait a bit for text to be saved to clipboard
        await new Promise(resolve => setTimeout(resolve, 300));
        text = getClipboardText();
      } catch (keyboardError) {
        safeConsole.error('Error using keyboard shortcut:', keyboardError);
        text = getClipboardText(); // Try to get whatever is in clipboard
      }
    }
    
    // If text is empty don't translate
    if (!text || text.trim() === '') {
      safeConsole.log('No text to translate');
      return;
    }
    
    // Save current text for later reference
    lastClipboardText = text;
    
    safeConsole.log(`Translating: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);
    
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
      safeConsole.error(`Translation error: ${error.message}`);
      
      if (translationWindow && !translationWindow.isDestroyed()) {
        translationWindow.webContents.send('translation-error', {
          error: error.message || 'Translation failed'
        });
      }
    }
  } catch (error) {
    safeConsole.error(`Translation process error: ${error}`);
  }
}

// Send text to translation window
function sendTextToTranslationWindow(text) {
  if (!text || !translationWindow) return;
  
  try {
    safeConsole.log('Sending text to translation window');
    
    if (translationWindow && !translationWindow.isDestroyed()) {
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
                  safeConsole.error('Vocabulary error:', error);
                  if (translationWindow && !translationWindow.isDestroyed()) {
                    translationWindow.webContents.send('vocabulary-error');
                  }
                });
            }
          }
        })
        .catch(error => {
          safeConsole.error('Translation error:', error);
          if (translationWindow && !translationWindow.isDestroyed()) {
            translationWindow.webContents.send('translation-error', { 
              error: error.message || 'Translation failed' 
            });
          }
        });
    }
  } catch (error) {
    safeConsole.error(`Error sending to translation window: ${error.message}`);
    // Try to show error if window is available
    if (translationWindow && !translationWindow.isDestroyed()) {
      try {
        translationWindow.webContents.send('translation-error', { 
          error: `Application error: ${error.message}` 
        });
      } catch (e) {
        safeConsole.error('Failed to send error to window:', e);
      }
    }
  }
}

// Function to create a browser window with appropriate options
function createWindow(options, windowType) {
  const defaults = {
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  };
  
  const windowOptions = { ...defaults, ...options };
  
  // Set minimum width and height equal to initial size if resizable
  if (windowOptions.resizable !== false) {
    windowOptions.minWidth = windowOptions.width;
    windowOptions.minHeight = windowOptions.height;
  }
  
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
      try {
        safeConsole.log(`${windowType} window hidden instead of closed`);
      } catch (error) {
        // Silently fail if logging fails
      }
      return false;
    }
    return true;
  });
  
  // Add event for when window is hidden
  window.on('hide', () => {
    // When we hide the window, set the window destroyed flag
    isTranslationWindowDestroyed = false;
    safeConsole.log('translationWindow was hidden');
  });
  
  // Track when window is actually destroyed
  window.on('closed', () => {
    try {
      safeConsole.log(`${windowType} window was actually destroyed`);
    } catch (error) {
      // Silently fail if logging fails
    }
    switch (windowType) {
      case 'translation':
        isTranslationWindowDestroyed = true;
        translationWindow = null;
        break;
      case 'settings':
        isSettingsWindowDestroyed = true;
        settingsWindow = null;
        break;
      case 'about':
        isAboutWindowDestroyed = true;
        aboutWindow = null;
        break;
      case 'translateNow':
        isTranslateNowWindowDestroyed = true;
        translateNowWindow = null;
        break;
    }
  });
  
  // Update flag when window is created
  switch (windowType) {
    case 'translation':
      isTranslationWindowDestroyed = false;
      break;
    case 'settings':
      isSettingsWindowDestroyed = false;
      break;
    case 'about':
      isAboutWindowDestroyed = false;
      break;
    case 'translateNow':
      isTranslateNowWindowDestroyed = false;
      break;
  }
  
  return window;
}

// Create translation window
function createTranslationWindow() {
  if (translationWindow) {
    translationWindow.show();
    return translationWindow;
  }
  
  translationWindow = createWindow({
    width: 580,
    height: 520,
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
  }, 'translation');

  // Check for translation.html file
  const translationHtmlPath = path.join(__dirname, 'renderer', 'translation.html');
  try {
    safeConsole.log(`Loading translation window from: ${translationHtmlPath}`);
  } catch (error) {
    // Silently fail if logging fails
  }
  
  try {
    translationWindow.loadFile(translationHtmlPath);
    
    translationWindow.once('ready-to-show', () => {
      translationWindow.show();
    });
    
    // Check for potential errors
    translationWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      safeConsole.error(`Failed to load translation window: ${errorDescription} (${errorCode})`);
    });
    
    return translationWindow;
  } catch (error) {
    safeConsole.error(`Error creating translation window: ${error.message}`);
    if (translationWindow) {
      translationWindow.close();
      translationWindow = null;
    }
    return null;
  }
}

// Open settings window
function openSettings() {
  // If window exists and is not destroyed, activate it
  if (settingsWindow && !isSettingsWindowDestroyed) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.focus();
    return;
  }
  
  // If window is hidden but still exists, show it again
  if (settingsWindow && settingsWindow.isVisible() === false) {
    settingsWindow.show();
    return;
  }
  
  // Window is likely damaged, set to null to create a new window
  if (settingsWindow) {
    settingsWindow = null;
  }
  
  // Create a new window
  settingsWindow = createWindow({
    width: 500,
    height: 650,
    title: 'Pro Translator Settings',
    resizable: true
  }, 'settings');

  // Check for settings.html file
  const settingsHtmlPath = path.join(__dirname, 'renderer', 'settings.html');
  try {
    safeConsole.log(`Loading settings window from: ${settingsHtmlPath}`);
  } catch (error) {
    // Silently fail if logging fails
  }
  
  try {
    settingsWindow.loadFile(settingsHtmlPath);
    
    // Check for potential errors
    settingsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      safeConsole.error(`Failed to load settings window: ${errorDescription} (${errorCode})`);
    });
    
    // Add this event to ensure maintaining correct state
    settingsWindow.on('hide', () => {
      isSettingsWindowDestroyed = false;  // Window is hidden but not destroyed
      safeConsole.log('settings window was hidden');
    });
    
    // Add event for when window is shown
    settingsWindow.on('show', () => {
      safeConsole.log('settings window was shown');
      safeConsole.log('Settings window was shown');
      isSettingsWindowDestroyed = false;
    });
    
  } catch (error) {
    safeConsole.error(`Error creating settings window: ${error.message}`);
    if (settingsWindow) {
      settingsWindow.close();
      settingsWindow = null;
      isSettingsWindowDestroyed = true;
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
    width: 350,
    height: 330,
    title: 'About Pro Translator',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false
  }, 'about');

  // Check for about.html file
  const aboutHtmlPath = path.join(__dirname, 'renderer', 'about.html');
  try {
    safeConsole.log(`Loading about window from: ${aboutHtmlPath}`);
  } catch (error) {
    // Silently fail if logging fails
  }
  
  try {
    aboutWindow.loadFile(aboutHtmlPath);
    
    // Check for potential errors
    aboutWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      safeConsole.error(`Failed to load about window: ${errorDescription} (${errorCode})`);
    });
  } catch (error) {
    safeConsole.error(`Error creating about window: ${error.message}`);
    if (aboutWindow) {
      aboutWindow.close();
      aboutWindow = null;
    }
  }
}

// Create direct translation window
function openTranslateNow() {
  // If window exists and is not destroyed, activate it
  if (translateNowWindow && !isTranslateNowWindowDestroyed) {
    if (translateNowWindow.isMinimized()) {
      translateNowWindow.restore();
    }
    translateNowWindow.focus();
    return translateNowWindow;
  }
  
  // If window is hidden but still exists, show it again
  if (translateNowWindow && translateNowWindow.isVisible() === false) {
    translateNowWindow.show();
    return translateNowWindow;
  }
  
  // Window is likely damaged, set to null to create a new window
  if (translateNowWindow) {
    translateNowWindow = null;
  }
  
  translateNowWindow = createWindow({
    width: 850,
    height: 600,
    title: 'Language Tools',
    resizable: true
  }, 'translateNow');

  // Check for translate-now.html file
  const translateNowHtmlPath = path.join(__dirname, 'renderer', 'translate-now.html');
  try {
    safeConsole.log(`Loading translate-now window from: ${translateNowHtmlPath}`);
  } catch (error) {
    // Silently fail if logging fails
  }
  
  try {
    translateNowWindow.loadFile(translateNowHtmlPath);
    
    // Check for potential errors
    translateNowWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      safeConsole.error(`Failed to load translate-now window: ${errorDescription} (${errorCode})`);
    });
    
    // Add this event to ensure maintaining correct state
    translateNowWindow.on('hide', () => {
      isTranslateNowWindowDestroyed = false;  // Window is hidden but not destroyed
      safeConsole.log('translateNow window was hidden');
    });
    
    // Add event for when window is shown
    translateNowWindow.on('show', () => {
      safeConsole.log('TranslateNow window was shown');
      isTranslateNowWindowDestroyed = false;
    });
    
    // Send settings to window ONLY after window is fully loaded
    translateNowWindow.webContents.once('did-finish-load', () => {
      const settings = store.get();
      safeConsole.log('Translate-now window loaded, sending settings');
      translateNowWindow.webContents.send('load-settings', settings);
      
      // Apply dark mode
      if (settings.darkMode) {
        safeConsole.log('Applying dark mode to translate-now window');
        translateNowWindow.webContents.send('set-dark-mode', true);
      }
    });
  } catch (error) {
    safeConsole.error(`Error creating translate-now window: ${error.message}`);
    if (translateNowWindow) {
      translateNowWindow.close();
      isTranslateNowWindowDestroyed = true;
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
    safeConsole.error('Translation API error:', error);
    
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
    safeConsole.error('Vocabulary API error:', error);
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
    safeConsole.error('Error parsing vocabulary JSON:', error);
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

// Handle close-window event from renderer processes
ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    // Hide the window instead of closing it
    win.hide();
    safeConsole.log('Window hidden (not closed) due to ESC key');
  }
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
    safeConsole.log('Setting up macOS context menu');
    const { systemPreferences } = require('electron');
    
    // Ensure access to clipboard
    if (systemPreferences && systemPreferences.askForMediaAccess) {
      systemPreferences.askForMediaAccess('microphone');
    }
  } catch (error) {
    safeConsole.error(`Error setting up context menu: ${error.message}`);
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

// Set IPC handler for getting log file path
ipcMain.on('get-log-file-path', (event) => {
  event.returnValue = getLogFilePath();
});

// Function to properly clean up and exit
function cleanupAndExit() {
  safeConsole.log('Cleaning up before exit...');
  
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  // Clear watchdog timer
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  
  // Set app quitting flag to true
  app.isQuitting = true;
  
  // Ensure all pending events are processed
  process.nextTick(() => {
    try {
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      
      // Close all windows properly
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.close();
        }
      });
      
      // If tray exists, destroy it
      if (tray) {
        try {
          tray.destroy();
          tray = null;
        } catch (error) {
          console.error('Error destroying tray:', error);
        }
      }
      
      safeConsole.log('Cleanup complete, exiting application');
      
      // Small delay to ensure cleanup process is completed
      setTimeout(() => {
        // This is for when the app doesn't exit properly
        try {
          safeConsole.log('Force exit if still running');
          process.exit(0);
        } catch (error) {
          console.error('Error during forced exit:', error);
          // Last resort exit
          process.exit(1);
        }
      }, 100); // Give enough time to process events
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      process.exit(1);
    }
  });
}

// Handle app activation (macOS)
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createTranslationWindow();
  }
});

// Handle app will-quit event (called before the windows close)
app.on('will-quit', () => {
  safeConsole.log('Application will quit...');
  // Final cleanup before app completely exits
  globalShortcut.unregisterAll();
});

// Setup application watchdog to detect and recover from hangs
function setupWatchdog() {
  // Clear any existing watchdog timer
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  
  // Create a new watchdog timer that checks the application state every 5 seconds
  watchdogTimer = setInterval(() => {
    try {
      // Calculate uptime in minutes
      const uptimeMinutes = Math.floor((Date.now() - applicationStartTime) / 60000);
      
      // Check for excessive memory usage (>500MB)
      const memoryInfo = process.memoryUsage();
      const memoryUsageMB = Math.round(memoryInfo.heapUsed / 1024 / 1024);
      
      // Log memory usage every 5 minutes
      if (uptimeMinutes % 5 === 0) {
        safeConsole.log(`Memory usage: ${memoryUsageMB}MB, Uptime: ${uptimeMinutes} minutes`);
      }
      
      // Check for abnormal memory growth (>500MB)
      if (memoryUsageMB > 500) {
        safeConsole.warn(`Excessive memory usage detected: ${memoryUsageMB}MB. Requesting garbage collection.`);
        if (global.gc) {
          global.gc(); // Force garbage collection if available
        }
      }
      
      // Check if we have an excessive number of windows
      const windowCount = BrowserWindow.getAllWindows().length;
      if (windowCount > 5) {
        safeConsole.warn(`Excessive window count detected: ${windowCount}. Cleaning up unused windows.`);
        
        // Close any duplicate windows
        const windowIds = new Set();
        BrowserWindow.getAllWindows().forEach(win => {
          // A simple way to detect duplicate windows - using URL or title
          const winId = win.getTitle() || '';
          
          if (windowIds.has(winId)) {
            // This is likely a duplicate window
            safeConsole.log(`Closing duplicate window: ${winId}`);
            win.close();
          } else {
            windowIds.add(winId);
          }
        });
      }
    } catch (error) {
      safeConsole.error('Error in watchdog timer:', error);
    }
  }, 5000);
  
  safeConsole.log('Application watchdog started');
} 