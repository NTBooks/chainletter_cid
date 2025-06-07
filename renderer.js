const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('file-info');

// Store extracted content
let extractedContent = null;

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
                    <th>Preview</th>
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
            const previewCell = document.createElement('td');
            previewCell.style.width = '100px';
            previewCell.style.height = '100px';
            previewCell.style.padding = '5px';

            if (result.imagePreview) {
                const img = document.createElement('img');
                img.src = result.imagePreview;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
                previewCell.appendChild(img);
            }

            const nameCell = document.createElement('td');
            nameCell.textContent = result.fileName;

            const cidCell = document.createElement('td');
            cidCell.className = 'cid-display';
            cidCell.textContent = result.cid;

            row.appendChild(previewCell);
            row.appendChild(nameCell);
            row.appendChild(cidCell);
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

        // Create content container
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <div>File: ${result.fileName}</div>
            <div class="cid-display">CID: ${result.cid}</div>
        `;

        if (result.type === 'zip-with-manifest') {
            contentDiv.innerHTML += `<div>Target file: ${result.targetFileName}</div>`;

            // Create two-column layout
            const columnsDiv = document.createElement('div');
            columnsDiv.style.display = 'flex';
            columnsDiv.style.justifyContent = 'space-between';
            columnsDiv.style.alignItems = 'center';
            columnsDiv.style.marginTop = '20px';

            // Left column for preview
            const previewColumn = document.createElement('div');
            previewColumn.style.flex = '1';
            previewColumn.style.textAlign = 'center';

            if (result.imagePreview) {
                const previewDiv = document.createElement('div');
                previewDiv.style.margin = '0 auto';
                previewDiv.style.maxWidth = '120px';
                previewDiv.style.maxHeight = '120px';

                const img = document.createElement('img');
                img.src = result.imagePreview;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';

                previewDiv.appendChild(img);
                previewColumn.appendChild(previewDiv);
            }

            // Right column for extract button
            const buttonColumn = document.createElement('div');
            buttonColumn.style.flex = '1';
            buttonColumn.style.textAlign = 'center';

            const extractButton = document.createElement('button');
            extractButton.textContent = 'Extract file';
            extractButton.addEventListener('click', async () => {
                const extractResult = await window.electronAPI.extractFile();
                if (extractResult.success) {
                    alert(`File saved to: ${extractResult.path}`);
                } else if (extractResult.error) {
                    alert(`Error: ${extractResult.error}`);
                }
            });

            buttonColumn.appendChild(extractButton);

            // Add columns to the layout
            columnsDiv.appendChild(previewColumn);
            columnsDiv.appendChild(buttonColumn);

            fileEntry.appendChild(contentDiv);
            fileEntry.appendChild(columnsDiv);
        } else {
            if (result.imagePreview) {
                const previewDiv = document.createElement('div');
                previewDiv.style.margin = '10px 0';
                previewDiv.style.maxWidth = '200px';
                previewDiv.style.maxHeight = '200px';

                const img = document.createElement('img');
                img.src = result.imagePreview;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';

                previewDiv.appendChild(img);
                contentDiv.appendChild(previewDiv);
            }

            fileEntry.appendChild(contentDiv);
        }

        fileInfo.appendChild(fileEntry);
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

window.electronAPI.onOpenFile((filePath) => {
    handleFiles([{ path: filePath }]);
}); 