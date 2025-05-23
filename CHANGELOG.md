# Pro Translator Changelog

## [3.0.0] - 2024-05-23

### Added
- Google Gemini API support as alternative to OpenRouter
- API provider selection dropdown in settings (OpenRouter/Gemini)
- Separate API key fields for OpenRouter and Gemini
- Auto-populate and rewrite functionality for Language Tools shortcut
- When selected text exists, Language Tools shortcut automatically populates text and runs rewrite styles
- Improved Rewrite Styles output formatting for both OpenRouter and Gemini
- Better JSON parsing for rewrite responses with fallback handling
- Enhanced Language Tools window with automatic text processing
- Direct link to Google AI Studio API key page

### Changed
- Default API provider changed from OpenRouter to Google Gemini
- Language Tools shortcut now detects selected text and auto-processes it
- Improved rewrite styles detection for both array and object JSON formats
- Enhanced error handling for different API response formats
- Better clipboard integration for auto-populate functionality

### Fixed
- Rewrite styles now display properly for Gemini API responses
- Fixed JSON parsing issues with malformed API responses
- Improved text selection handling across different applications
- Enhanced AppleScript fallback methods for better compatibility
- Various minor bug fixes and stability improvements

## [2.7.0] - 2024-05-19

### Added
- Automatic update check on startup
- Improved update dialogs with app icon
- UI/UX improvements for download window

### Fixed
- Progress bar now updates correctly during download
- Minor bug fixes and performance improvements

## [2] - 2024-05-19

### Fixed
- Fixed various UI bugs and performance issues
- Improved stability and reliability
- Enhanced error handling and recovery mechanisms

## [2.5] - 2024-05-19

### Fixed
- Fixed various UI bugs and performance issues
- Improved stability and reliability
- Enhanced error handling and recovery mechanisms

## [2.5.0] - 2024-05-19

### Fixed
- Fixed various UI bugs and performance issues
- Improved stability and reliability
- Enhanced error handling and recovery mechanisms

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