const { app, BrowserWindow, ipcMain, dialog, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ipfsOnlyHash = require('ipfs-only-hash');

let mainWindow;
let currentZipInfo = null;
let tray = null;
let openFileOnReady = null;

// On Windows, the file path is in process.argv when the app is launched by double-click
if (process.platform === 'win32' && process.argv.length >= 2) {
    const filePath = process.argv.find(arg => arg.endsWith('.clstamp'));
    if (filePath) {
        openFileOnReady = filePath;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 600,
        icon: path.join(__dirname, 'appicon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('index.html');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv, workingDirectory) => {
        // Windows: file path is in argv
        const filePath = argv.find(arg => arg.endsWith('.clstamp'));
        if (filePath && mainWindow) {
            mainWindow.webContents.send('open-file', filePath);
        }
    });

    app.whenReady().then(() => {
        // macOS: handle open-file event
        app.on('open-file', (event, filePath) => {
            event.preventDefault();
            if (mainWindow) {
                mainWindow.webContents.send('open-file', filePath);
            }
        });
        createWindow();
        tray = new Tray(path.join(__dirname, 'appicon.ico'));
        tray.setToolTip('Chainletter File Viewer');

        // If a file was passed on startup, send it to the renderer
        if (openFileOnReady && mainWindow) {
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('open-file', openFileOnReady);
            });
        }
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.png', '.jpg', '.jpeg'].includes(ext);
}

function getImagePreview(filePath) {
    try {
        const imageBuffer = fs.readFileSync(filePath);
        return `data:image/${path.extname(filePath).slice(1)};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Error reading image:', error);
        return null;
    }
}

// Handle file extraction
ipcMain.handle('extract-file', async () => {
    try {
        if (!currentZipInfo) {
            throw new Error('No zip file has been processed');
        }

        const { filePath: savePath } = await dialog.showSaveDialog({
            defaultPath: currentZipInfo.targetFileName,
            properties: ['createDirectory']
        });

        if (savePath) {
            const zip = new AdmZip(currentZipInfo.zipPath);
            const targetEntry = zip.getEntry(currentZipInfo.targetFileName);

            if (!targetEntry) {
                return { success: false, error: 'Verified file not found in zip' };
            }

            // Create a temporary file
            const tempDir = path.join(app.getPath('temp'), 'chainletter-extract');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempPath = path.join(tempDir, currentZipInfo.targetFileName);

            // Extract to temp file first
            zip.extractEntryTo(targetEntry, tempDir, false, true);

            // Then copy to final destination
            fs.copyFileSync(tempPath, savePath);

            // Clean up temp file
            try {
                fs.unlinkSync(tempPath);
            } catch (e) {
                console.error('Error cleaning up temp file:', e);
            }

            return { success: true, path: savePath };
        }
        return { success: false };
    } catch (error) {
        console.error('Extraction error:', error);
        return { success: false, error: error.message };
    }
});

// Handle file processing
ipcMain.handle('process-file', async (event, filePath) => {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.zip' || ext === '.zip.clstamp' || ext === '.clstamp') {
            const zip = new AdmZip(filePath);
            const manifestEntry = zip.getEntry('manifest.txt');

            if (manifestEntry) {
                const manifestContent = zip.readAsText(manifestEntry);
                const targetFileName = manifestContent.trim();
                const targetEntry = zip.getEntry(targetFileName);

                if (targetEntry) {
                    // Extract the target file to a temp location to calculate its CID
                    const tempDir = path.join(app.getPath('temp'), 'chainletter-preview');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    const tempPath = path.join(tempDir, targetFileName);
                    zip.extractEntryTo(targetEntry, tempDir, false, true);

                    // Calculate CID of the extracted file
                    const targetBuffer = fs.readFileSync(tempPath);
                    const cid = await ipfsOnlyHash.of(targetBuffer);

                    // If it's an image, create a preview
                    let imagePreview = null;
                    if (isImageFile(targetFileName)) {
                        imagePreview = getImagePreview(tempPath);
                    }

                    try {
                        fs.unlinkSync(tempPath);
                    } catch (e) {
                        console.error('Error cleaning up preview temp file:', e);
                    }

                    currentZipInfo = {
                        zipPath: filePath,
                        targetFileName
                    };

                    return {
                        type: 'zip-with-manifest',
                        cid,
                        fileName: path.basename(filePath),
                        targetFileName,
                        imagePreview
                    };
                }
            }
        }

        // For regular files, check if it's an image
        let imagePreview = null;
        let cid = await ipfsOnlyHash.of(fileBuffer);
        if (isImageFile(filePath)) {
            imagePreview = getImagePreview(filePath);
        }

        currentZipInfo = null;
        return {
            type: 'regular',
            cid,
            fileName: path.basename(filePath),
            imagePreview
        };
    } catch (error) {
        console.error('Processing error:', error);
        currentZipInfo = null;
        return { error: error.message };
    }
}); 