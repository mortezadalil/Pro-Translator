# Pro Translator

A powerful desktop translation application built with Electron that works on Windows, macOS, and Linux.

**Current Version: 2.5.0**

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