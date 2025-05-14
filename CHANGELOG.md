# Pro Translator Changelog

## [2.5.0] - 2024-05-14

### Fixed
- Fixed issue with multiple instances of the application launching simultaneously
- Resolved RTL/LTR text direction issues in the translate-now interface
- Fixed pin icon rotation (now rotates 90 degrees when active)
- Improved text alignment for RTL languages (Persian, Arabic)
- Fixed application crashing due to synchronous logging operations
- Improved cleanup procedures when closing the application
- Fixed Windows behavior where closing windows would quit the entire application
- Improved tray icon integration to keep app running when all windows are closed

### Added
- Added proper text selection support throughout the application
- Added context menu (right-click) for all text containers including result area
- Added Ctrl+A / Cmd+A support for selecting all text in any text container
- Added Ctrl+C / Cmd+C support for copying selected text throughout the application
- Added Ctrl+V / Cmd+V support for pasting text in the original text box
- Added visual feedback when copying/pasting text
- Added improved handling of window state tracking
- Added improved build configuration for Windows and macOS
- Added universal binary support for macOS (Intel and Apple Silicon)

### Changed
- Changed context menu options from "Copy Selected" to "Copy" for better clarity
- Enhanced the Paste button functionality with better error handling
- Improved the result container styling for better selection visibility
- Made the result container properly focusable for better keyboard navigation
- Implemented a fallback mechanism for logging to temporary directories
- Enhanced Windows installer with customizable installation directory
- Improved macOS DMG layout with drag-to-Applications folder
- Focused on 64-bit architecture support for optimal performance
- Modified window behavior on Windows to hide instead of close when X button is clicked

### Removed
- Removed developer tools access for security and stability

### Developer Changes
- Added better error handling for log file operations
- Fixed code organization issues where safeConsole was being used before initialization
- Improved build scripts with separate commands for different platforms
- Added proper entitlements for macOS builds 