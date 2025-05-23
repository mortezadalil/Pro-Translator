# Pro Translator

A powerful desktop translation application built with Electron that works on Windows, macOS, and Linux.

**Current Version: 3.0.0**

## 📥 Download Latest Version

### 🪟 Windows
[![Download for Windows](https://img.shields.io/badge/Download-Windows-blue?style=for-the-badge&logo=windows)](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator.Setup.3.0.0.exe)
- **🔧 Installer**: [Pro Translator Setup 3.0.0.exe](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator.Setup.3.0.0.exe) *(Recommended)*
- **📦 Portable**: [Pro Translator 3.0.0.exe](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator.3.0.0.exe)

### 🍎 macOS
[![Download for macOS](https://img.shields.io/badge/Download-macOS-black?style=for-the-badge&logo=apple)](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator-3.0.0-arm64.dmg)
- **💿 DMG Installer**: [Pro Translator-3.0.0-arm64.dmg](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator-3.0.0-arm64.dmg) *(Recommended)*
- **📁 ZIP Archive**: [Pro Translator-3.0.0-arm64-mac.zip](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator-3.0.0-arm64-mac.zip)

### 🐧 Linux
[![Download for Linux](https://img.shields.io/badge/Download-Linux-orange?style=for-the-badge&logo=linux)](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator-3.0.0-arm64.AppImage)
- **🚀 AppImage**: [Pro Translator-3.0.0-arm64.AppImage](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/Pro.Translator-3.0.0-arm64.AppImage) *(Universal)*
- **📦 DEB Package**: [pro-translator_3.0.0_arm64.deb](https://github.com/mortezadalil/Pro-Translator/releases/download/v3.0.0/pro-translator_3.0.0_arm64.deb) *(Ubuntu/Debian)*

---

## ✨ What's New in v3.0.0

🔥 **Major Features:**
- 🤖 **Google Gemini AI Integration** - Now supports both OpenRouter and Google Gemini APIs
- ⚡ **Smart Auto-Rewrite** - Language Tools shortcut automatically detects selected text and runs rewrite styles
- 🎯 **Enhanced UI** - Better formatting for rewrite results with modern card-based design
- 🔗 **Direct API Links** - Quick access to API key pages for both providers

🛠️ **Improvements:**
- 🎨 Improved JSON parsing for better compatibility
- 🔧 Enhanced error handling and fallback mechanisms
- 📋 Better clipboard integration across platforms
- 🐛 Various bug fixes and stability improvements

---

## Features

- Instant translation with keyboard shortcuts
- Support for multiple languages including RTL languages (Persian, Arabic)
- Context menu for easy text manipulation
- Keyboard shortcuts for selecting, copying, and pasting text
- Dark mode support
- Always-on-top option for convenient use

## Development

### Prerequisites

- Node.js 16+ and npm

### Setup

1. Clone the repository
   ```
   git clone https://github.com/yourusername/Pro-Translator.git
   cd Pro-Translator
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Run in development mode
   ```
   npm run dev
   ```

4. For a better development experience with auto-restart:
   ```
   npm run develop
   ```

## Building

### Building for macOS

```
npm run build:mac
```

This creates:
- Universal DMG installer (works on both Intel and Apple Silicon)
- ZIP archive for distribution

### Building for Windows

```
npm run build:win
```

This creates:
- NSIS installer with customizable installation options
- Portable executable that can run without installation

### Building for Linux

```
npm run build:linux
```

This creates:
- AppImage
- DEB package

### Building for all platforms

```
npm run build:all
```

## Distribution

The built packages can be found in the `dist` directory:

- macOS: 
  - `dist/Pro Translator-[version]-universal.dmg` (Installer)
  - `dist/Pro Translator-[version]-universal-mac.zip` (ZIP archive)

- Windows:
  - `dist/Pro Translator Setup [version].exe` (Installer)
  - `dist/Pro Translator [version].exe` (Portable)

- Linux:
  - `dist/pro-translator-[version].AppImage`
  - `dist/pro-translator_[version]_amd64.deb`

## License

MIT 