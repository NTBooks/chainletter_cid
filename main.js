const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ipfsOnlyHash = require('ipfs-only-hash');

let mainWindow;

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

// Handle file save dialog
ipcMain.handle('save-file', async (event, { filePath, content }) => {
    const { filePath: savePath } = await dialog.showSaveDialog({
        defaultPath: path.basename(filePath)
    });

    if (savePath) {
        fs.writeFileSync(savePath, content);
        return { success: true, path: savePath };
    }
    return { success: false };
});

// Handle file processing
ipcMain.handle('process-file', async (event, filePath) => {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const cid = await ipfsOnlyHash.of(fileBuffer);

        if (path.extname(filePath).toLowerCase() === '.zip') {
            const zip = new AdmZip(filePath);
            const manifestEntry = zip.getEntry('manifest.txt');

            if (manifestEntry) {
                const manifestContent = zip.readAsText(manifestEntry);
                const targetFileName = manifestContent.trim();
                const targetEntry = zip.getEntry(targetFileName);

                if (targetEntry) {
                    return {
                        type: 'zip-with-manifest',
                        cid,
                        fileName: path.basename(filePath),
                        targetFileName,
                        targetContent: zip.readFile(targetEntry)
                    };
                }
            }
        }

        return {
            type: 'regular',
            cid,
            fileName: path.basename(filePath)
        };
    } catch (error) {
        return { error: error.message };
    }
}); 