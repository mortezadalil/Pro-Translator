// This file is the entry point that sets the app name before loading the main app
const { app } = require('electron');

// Override the app name to fix macOS menu bar display
process.env.APP_NAME = 'Pro Translator';
app.setName('Pro Translator');
app.name = 'Pro Translator';
app.commandLine.appendSwitch('--name', 'Pro Translator');

// Check any command line arguments for name
process.argv.forEach((arg) => {
  if (arg.startsWith('--name=')) {
    const name = arg.split('=')[1];
    app.setName(name);
    app.name = name;
  }
});

// Now load the main app code
require('./main'); 