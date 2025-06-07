const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('file-info');

const handleFiles = async (files) => {
    if (files.length === 0) return;

    dropzone.classList.add('has-files');
    fileInfo.innerHTML = '';

    if (files.length > 1) {
        // Create table for multiple files
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Filename</th>
                    <th>CID</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        fileInfo.appendChild(table);

        for (const file of files) {
            const result = await window.electronAPI.processFile(file.path);
            if (result.error) {
                console.error(`Error processing ${file.name}:`, result.error);
                continue;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.fileName}</td>
                <td class="cid-display">${result.cid}</td>
            `;
            table.querySelector('tbody').appendChild(row);
        }
    } else {
        // Single file display
        const file = files[0];
        const result = await window.electronAPI.processFile(file.path);

        if (result.error) {
            fileInfo.innerHTML = `<div class="file-entry">Error: ${result.error}</div>`;
            return;
        }

        const fileEntry = document.createElement('div');
        fileEntry.className = 'file-entry';

        let content = `
            <div>File: ${result.fileName}</div>
            <div class="cid-display">CID: ${result.cid}</div>
        `;

        if (result.type === 'zip-with-manifest') {
            content += `
                <div>Target file: ${result.targetFileName}</div>
                <button onclick="extractFile('${result.targetFileName}', '${result.cid}')">Extract file</button>
            `;
        }

        fileEntry.innerHTML = content;
        fileInfo.appendChild(fileEntry);
    }
};

const extractFile = async (fileName, cid) => {
    const result = await window.electronAPI.saveFile(fileName, null);
    if (result.success) {
        alert(`File saved to: ${result.path}`);
    }
};

// Drag and drop handlers
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

// File input handler
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
}); 