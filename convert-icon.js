const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'build', 'icon.png');
const targetIco = path.join(__dirname, 'build', 'icon.ico');

console.log('Converting PNG to ICO...');

// Read the PNG file
fs.readFile(sourceFile, (err, buffer) => {
  if (err) {
    console.error('Error reading source file:', err);
    process.exit(1);
  }

  // Convert to ICO
  const icoBuffer = png2icons.createICO(buffer, png2icons.BILINEAR, false, false);
  
  if (!icoBuffer) {
    console.error('Error converting PNG to ICO');
    process.exit(1);
  }

  // Write the ICO file
  fs.writeFile(targetIco, icoBuffer, (err) => {
    if (err) {
      console.error('Error writing ICO file:', err);
      process.exit(1);
    }
    
    console.log('ICO file created successfully:', targetIco);
  });
}); 