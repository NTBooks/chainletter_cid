const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ipfsOnlyHash = require('ipfs-only-hash');

let mainWindow;
let currentZipInfo = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

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
                return { success: false, error: 'Target file not found in zip' };
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
        const cid = await ipfsOnlyHash.of(fileBuffer);

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.zip' || ext === '.zip.clstamp') {
            const zip = new AdmZip(filePath);
            const manifestEntry = zip.getEntry('manifest.txt');

            if (manifestEntry) {
                const manifestContent = zip.readAsText(manifestEntry);
                const targetFileName = manifestContent.trim();
                const targetEntry = zip.getEntry(targetFileName);

                if (targetEntry) {
                    // If it's an image, create a preview
                    let imagePreview = null;
                    if (isImageFile(targetFileName)) {
                        const tempDir = path.join(app.getPath('temp'), 'chainletter-preview');
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        const tempPath = path.join(tempDir, targetFileName);
                        zip.extractEntryTo(targetEntry, tempDir, false, true);
                        imagePreview = getImagePreview(tempPath);
                        try {
                            fs.unlinkSync(tempPath);
                        } catch (e) {
                            console.error('Error cleaning up preview temp file:', e);
                        }
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