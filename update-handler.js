const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

class UpdateHandler {
    constructor() {
        this.currentVersion = app.getVersion();
        this.releasesUrl = 'https://api.github.com/repos/mortezadalil/Pro-Translator/releases';
        this.downloadWindow = null;

        // Set up IPC handlers for the download window
        ipcMain.on('update-progress', (event, data) => {
            if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                this.downloadWindow.webContents.executeJavaScript(`
                    document.getElementById('progress').style.width = '${data.progress}%';
                    document.getElementById('status').textContent = '${data.status}';
                `);
            }
        });

        ipcMain.on('download-complete', () => {
            if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                this.downloadWindow.webContents.executeJavaScript(`
                    document.getElementById('status').textContent = 'Download complete!';
                `);
            }
        });
    }

    async checkForUpdates(showNoUpdateDialog = true) {
        try {
            console.log('Checking for updates...');
            const response = await axios.get(this.releasesUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Pro-Translator-App'
                }
            });
            
            console.log('Response received:', response.status);
            
            if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
                throw new Error('No releases found in repository');
            }

            const latestRelease = response.data[0];
            const latestVersion = latestRelease.tag_name.replace('v', '');
            console.log(`Current version: ${this.currentVersion}, Latest version: ${latestVersion}`);
            
            // Use the app's icon for dialogs
            const appIcon = path.join(__dirname, 'build', 'icon.png');
            
            if (this.compareVersions(latestVersion, this.currentVersion) > 0) {
                const updateDialog = await dialog.showMessageBox({
                    type: 'info',
                    title: 'Update Available',
                    message: `A new version (${latestVersion}) is available. Would you like to download it?`,
                    buttons: ['Yes', 'No'],
                    defaultId: 0,
                    icon: appIcon
                });

                if (updateDialog.response === 0) {
                    this.downloadUpdate(latestRelease);
                }
            } else if (showNoUpdateDialog) {
                dialog.showMessageBox({
                    type: 'info',
                    title: 'No Updates',
                    message: 'You are using the latest version.',
                    buttons: ['OK'],
                    icon: appIcon
                });
            }
        } catch (error) {
            console.error('Update check error:', error);
            
            let errorMessage = 'Failed to check for updates. Please try again later.';
            
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                errorMessage = 'No internet connection. Please check your network and try again.';
            } else if (error.response?.status === 404) {
                errorMessage = 'Repository not found. Please contact the developer.';
            } else if (error.response?.status === 403) {
                errorMessage = 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('No releases found')) {
                errorMessage = 'No releases available yet. This is the current version.';
            }
            
            dialog.showErrorBox('Update Check Failed', errorMessage);
        }
    }

    compareVersions(v1, v2) {
        const v1Parts = v1.split('.').map(Number);
        const v2Parts = v2.split('.').map(Number);

        // Pad the shorter version with zeros
        while (v1Parts.length < v2Parts.length) v1Parts.push(0);
        while (v2Parts.length < v1Parts.length) v2Parts.push(0);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            if (v1Parts[i] > v2Parts[i]) return 1;
            if (v1Parts[i] < v2Parts[i]) return -1;
        }
        return 0;
    }

    getDownloadUrl(release) {
        const platform = os.platform();
        const assets = release.assets;

        if (platform === 'darwin') {
            return assets.find(asset => asset.name.endsWith('.dmg'))?.browser_download_url;
        } else if (platform === 'win32') {
            return assets.find(asset => asset.name.endsWith('.exe'))?.browser_download_url;
        } else if (platform === 'linux') {
            return assets.find(asset => asset.name.endsWith('.deb'))?.browser_download_url;
        }
        return null;
    }

    createDownloadWindow() {
        this.downloadWindow = new BrowserWindow({
            width: 400,
            height: 160,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            useContentSize: true,
            autoHideMenuBar: true,
            show: true,
            icon: null,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        // Create a temporary HTML file for the download window
        const htmlContent = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        html, body {
                            width: 100%;
                            height: 100%;
                            margin: 0;
                            padding: 0;
                            overflow: hidden;
                        }
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                            padding: 20px;
                            background-color: #f5f5f5;
                            text-align: center;
                            user-select: none;
                            box-sizing: border-box;
                        }
                        .progress-container {
                            width: 100%;
                            background-color: #e0e0e0;
                            border-radius: 4px;
                            margin: 20px 0;
                            overflow: hidden;
                        }
                        .progress-bar {
                            width: 0%;
                            height: 20px;
                            background-color: #4CAF50;
                            border-radius: 4px;
                            transition: width 0.3s;
                        }
                        .status {
                            margin-top: 10px;
                            color: #666;
                        }
                    </style>
                </head>
                <body>
                    <h3>Downloading New Version</h3>
                    <div class="progress-container">
                        <div class="progress-bar" id="progress"></div>
                    </div>
                    <div class="status" id="status">Preparing download...</div>
                    <script>
                        const { ipcRenderer } = require('electron');
                        ipcRenderer.on('update-progress', (event, data) => {
                            document.getElementById('progress').style.width = data.progress + '%';
                            document.getElementById('status').textContent = data.status;
                        });
                        ipcRenderer.on('download-complete', () => {
                            document.getElementById('status').textContent = 'Download complete!';
                        });
                    </script>
                </body>
            </html>
        `;

        // Load the HTML content
        this.downloadWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }

    async downloadUpdate(release) {
        const downloadUrl = this.getDownloadUrl(release);
        
        if (!downloadUrl) {
            dialog.showErrorBox('Download Error', 'Could not find a compatible download for your platform.');
            return;
        }

        this.createDownloadWindow();

        const downloadPath = path.join(os.tmpdir(), path.basename(downloadUrl));
        const file = fs.createWriteStream(downloadPath);

        try {
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'];
            let downloaded = 0;

            response.data.on('data', (chunk) => {
                downloaded += chunk.length;
                const progress = Math.round((downloaded / totalLength) * 100);
                
                if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                    this.downloadWindow.webContents.executeJavaScript(`
                        document.getElementById('progress').style.width = '${progress}%';
                        document.getElementById('status').textContent = 'Downloading... ${progress}%';
                    `);
                }
            });

            response.data.pipe(file);

            file.on('finish', () => {
                file.close();
                
                if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                    this.downloadWindow.webContents.executeJavaScript(`
                        document.getElementById('status').textContent = 'Download complete! Opening file...';
                    `);
                    
                    setTimeout(() => {
                        this.downloadWindow.close();
                        
                        // Open the downloaded file
                        const { shell } = require('electron');
                        shell.openPath(downloadPath);
                    }, 2000);
                }
            });

            file.on('error', (err) => {
                console.error('Download error:', err);
                if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                    this.downloadWindow.close();
                }
                dialog.showErrorBox('Download Error', 'Failed to download the update file.');
            });

        } catch (error) {
            console.error('Download error:', error);
            if (this.downloadWindow && !this.downloadWindow.isDestroyed()) {
                this.downloadWindow.close();
            }
            dialog.showErrorBox('Download Error', 'Failed to download the update file.');
        }
    }
}

module.exports = new UpdateHandler();