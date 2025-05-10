const { app } = require('electron');

// Force set the app name to replace "Electron" in the menu bar
if (app) {
  app.setName('Pro Translator');
  app.name = 'Pro Translator';
}

// Replace document title if it contains "Electron"
if (typeof document !== 'undefined') {
  const originalTitle = document.title;
  if (originalTitle && originalTitle.includes('Electron')) {
    document.title = originalTitle.replace('Electron', 'Pro Translator');
  }
} 