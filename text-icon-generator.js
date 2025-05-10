const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

// Create a directory for the generated icons if it doesn't exist
const iconDir = path.join(__dirname, 'assets');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Function to create a text-based icon
function createTextIcon(text, backgroundColor, textColor, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);
  
  // Set text properties
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.floor(size * 0.6)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Draw text in the center
  ctx.fillText(text, size / 2, size / 2);
  
  return canvas.toBuffer('image/png');
}

// Generate text-based icon for "PT"
try {
  // Create PNG icon with "PT" text
  const pngBuffer = createTextIcon('PT', '#007AFF', '#FFFFFF', 64);
  const pngPath = path.join(iconDir, 'pt-icon.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`PNG icon created at: ${pngPath}`);
  
  // Convert PNG to ICO for Windows
  const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BILINEAR, false, false);
  const icoPath = path.join(iconDir, 'pt-icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`ICO icon created at: ${icoPath}`);
  
  // Create a 16x16 version specifically for the tray icon
  const smallPngBuffer = createTextIcon('PT', '#007AFF', '#FFFFFF', 16);
  const smallPngPath = path.join(iconDir, 'pt-icon-16.png');
  fs.writeFileSync(smallPngPath, smallPngBuffer);
  console.log(`Small PNG icon created at: ${smallPngPath}`);
  
  // Convert to small ICO
  const smallIcoBuffer = png2icons.createICO(smallPngBuffer, png2icons.BILINEAR, false, false);
  const smallIcoPath = path.join(iconDir, 'pt-icon-16.ico');
  fs.writeFileSync(smallIcoPath, smallIcoBuffer);
  console.log(`Small ICO icon created at: ${smallIcoPath}`);
  
  console.log('All icons generated successfully!');
} catch (error) {
  console.error('Error generating icons:', error);
} 