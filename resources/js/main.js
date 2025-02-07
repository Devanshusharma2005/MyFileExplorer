window.addEventListener('load', async () => {
    try {
        await Neutralino.init();
        app.log('Application initialized successfully', 'success');
        await app.initializeApp();
    } catch (err) {
        app.log('Failed to initialize application: ' + err.message, 'error');
    }
});

const app = {
    state: {
        currentView: 'home',
        systemMonitor: null,
        fileExplorer: {
            currentPath: NL_CWD,
            selectedFile: null
        }
    },

    async initializeApp() {
        try {
            this.setupEventListeners();
            await this.updateSystemStats();
            this.startSystemMonitoring();
            this.initializeTools();
            
            if (!this.state.fileExplorer.currentPath) {
                await this.getCurrentDirectory();
            }
            
            await this.loadFileExplorer();
        } catch (error) {
            this.log('Error initializing app: ' + error.message, 'error');
        }
    },

  
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchView(e.currentTarget.dataset.view);
            });
        });

        document.getElementById('newFileBtn').addEventListener('click', () => this.createNewFile());
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadFile());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshFileList());

       
        document.getElementById('copyBtn').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('pasteBtn').addEventListener('click', () => this.pasteFromClipboard());
        document.getElementById('runCommand').addEventListener('click', () => this.executeCommand());

        document.getElementById('clearConsole').addEventListener('click', () => this.clearConsole());

        document.querySelector('.close-modal').addEventListener('click', () => this.closeModal());
    },

    // View Management
    switchView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        
        document.getElementById(`${viewName}View`).classList.add('active');
        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
        
        this.state.currentView = viewName;
        this.onViewChanged(viewName);
    },

    async onViewChanged(viewName) {
        switch(viewName) {
            case 'home':
                await this.updateSystemStats();
                break;
            case 'files':
                await this.loadFileExplorer();
                break;
            case 'system':
                await this.loadSystemInfo();
                break;
            case 'tools':
                this.initializeTools();
                break;
        }
    },

    // System Monitoring
    async updateSystemStats() {
        try {
            const memInfo = await Neutralino.computer.getMemoryInfo();
            
            // Calculate used memory
            const used = memInfo.total - memInfo.available;
            const usedFormatted = this.formatBytes(used);
            const totalFormatted = this.formatBytes(memInfo.total);
            const usagePercent = ((used / memInfo.total) * 100).toFixed(1);

            // Update the DOM elements
            document.getElementById('memoryUsed').textContent = `Used: ${usedFormatted}`;
            document.getElementById('memoryTotal').textContent = `Total: ${totalFormatted}`;
            document.getElementById('memoryPercentage').textContent = `${usagePercent}%`;

            // Update progress bar
            const progressBar = document.getElementById('memoryProgressBar');
            if (progressBar) {
                progressBar.style.width = `${usagePercent}%`;
                
                // Add color based on usage
                if (usagePercent > 90) {
                    progressBar.style.backgroundColor = 'var(--error-color)';
                } else if (usagePercent > 70) {
                    progressBar.style.backgroundColor = 'var(--warning-color)';
                } else {
                    progressBar.style.backgroundColor = 'var(--primary-color)';
                }
            }
        } catch (error) {
            this.log('Error updating system stats: ' + error.message, 'error');
        }
    },

    startSystemMonitoring() {
        // Initial update
        this.updateSystemStats();
        
        // Set up interval for updates
        if (!this.monitoringInterval) {
            this.monitoringInterval = setInterval(() => {
                this.updateSystemStats();
            }, 2000); // Update every 2 seconds
        }
    },

    // Add cleanup for the interval when needed
    stopSystemMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    },

    // Updated System Information
    async loadSystemInfo() {
        try {
            const osInfo = await Neutralino.os.getEnv("OS");
            const memInfo = await Neutralino.computer.getMemoryInfo();
            const cpuInfo = await Neutralino.os.execCommand('wmic cpu get name');

            document.getElementById('osInfo').innerHTML = `
                <p><strong>OS:</strong> ${osInfo || 'Unknown'}</p>
                <p><strong>Platform:</strong> ${NL_OS}</p>
                <p><strong>Architecture:</strong> ${NL_ARCH}</p>
            `;

            document.getElementById('hwInfo').innerHTML = `
                <p><strong>CPU:</strong> ${cpuInfo.stdout || 'Unknown'}</p>
                <p><strong>Memory:</strong> ${this.formatBytes(memInfo.total)}</p>
                <p><strong>Available:</strong> ${this.formatBytes(memInfo.available)}</p>
            `;

            // Storage information
            const storageInfo = await this.getStorageInfo();
            document.getElementById('networkInfo').innerHTML = storageInfo;
        } catch (error) {
            this.log('Error loading system info: ' + error.message, 'error');
        }
    },

    // Helper function to get storage info
    async getStorageInfo() {
        try {
            if (NL_OS === 'Windows') {
                const result = await Neutralino.os.execCommand('wmic logicaldisk get size,freespace,caption');
                return `<pre>${result.stdout}</pre>`;
            } else {
                const result = await Neutralino.os.execCommand('df -h');
                return `<pre>${result.stdout}</pre>`;
            }
        } catch (error) {
            return '<p>Storage information unavailable</p>';
        }
    },

    // Tools Initialization
    initializeTools() {
        // Initialize clipboard area
        document.getElementById('clipboardText').value = '';
        document.getElementById('commandInput').value = '';
        document.getElementById('commandOutput').textContent = '';
        
        // Add event listeners for tool buttons if not already added
        const copyBtn = document.getElementById('copyBtn');
        const pasteBtn = document.getElementById('pasteBtn');
        const runCommandBtn = document.getElementById('runCommand');
        
        if (!copyBtn.hasListener) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
            copyBtn.hasListener = true;
        }
        
        if (!pasteBtn.hasListener) {
            pasteBtn.addEventListener('click', () => this.pasteFromClipboard());
            pasteBtn.hasListener = true;
        }
        
        if (!runCommandBtn.hasListener) {
            runCommandBtn.addEventListener('click', () => this.executeCommand());
            runCommandBtn.hasListener = true;
        }
    },

    // Updated getCurrentDirectory function
    async getCurrentDirectory() {
        try {
            if (!this.state.fileExplorer.currentPath) {
                // Get documents directory as default
                this.state.fileExplorer.currentPath = await Neutralino.os.getPath('documents');
            }
            return this.state.fileExplorer.currentPath;
        } catch (error) {
            this.log('Error getting current directory: ' + error.message, 'error');
            return NL_CWD; // Fallback to current working directory
        }
    },

    // Updated createNewFile function
    async createNewFile() {
        try {
            const fileName = await this.promptUser('Create New File', 'Enter file name:');
            if (!fileName) return;

            const currentDir = await this.getCurrentDirectory();
            const filePath = NL_OS === 'Windows' 
                ? `${currentDir}\\${fileName}`
                : `${currentDir}/${fileName}`;
            
            await Neutralino.filesystem.writeFile(filePath, '');
            await Neutralino.os.showNotification('Success', `File created: ${fileName}`, 'INFO');
            this.log(`File created: ${fileName}`, 'success');
            await this.loadFileExplorer();
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to create file', 'ERROR');
            this.log('Error creating file: ' + error.message, 'error');
        }
    },

    // Updated uploadFile function
    async uploadFile() {
        try {
            const result = await Neutralino.os.showOpenDialog('Select a file to upload', {
                filters: [
                    { name: 'All Files', extensions: ['*'] }
                ],
                multiSelections: true // Enable multiple file selection
            });

            if (result && result.length > 0) {
                for (const sourceFile of result) {
                    const fileName = sourceFile.split(/[\\/]/).pop();
                    const currentDir = await this.getCurrentDirectory();
                    const targetPath = NL_OS === 'Windows' 
                        ? `${currentDir}\\${fileName}`
                        : `${currentDir}/${fileName}`;

                    try {
                        // Read the source file
                        const content = await Neutralino.filesystem.readBinaryFile(sourceFile);
                        // Write to target location
                        await Neutralino.filesystem.writeBinaryFile(targetPath, content);
                        
                        await Neutralino.os.showNotification('Success', `File uploaded: ${fileName}`, 'INFO');
                        this.log(`File uploaded: ${fileName}`, 'success');
                    } catch (fileError) {
                        await Neutralino.os.showNotification('Error', `Failed to upload: ${fileName}`, 'ERROR');
                        this.log(`Error uploading file ${fileName}: ${fileError.message}`, 'error');
                    }
                }
                
                // Refresh the file list after all uploads
                await this.loadFileExplorer();
            }
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to upload files', 'ERROR');
            this.log('Error uploading files: ' + error.message, 'error');
        }
    },

    async refreshFileList() {
        await this.loadFileExplorer();
        this.log('File list refreshed', 'info');
    },

    // Updated loadFileExplorer function
    async loadFileExplorer() {
        try {
            const currentPath = await this.getCurrentDirectory();
            const entries = await Neutralino.filesystem.readDirectory(currentPath);
            
            const fileList = document.getElementById('fileList');
            fileList.innerHTML = '';

            // Add current path display
            const pathDisplay = document.createElement('div');
            pathDisplay.className = 'current-path';
            pathDisplay.innerHTML = `<i class="fas fa-folder-open"></i> ${currentPath}`;
            fileList.appendChild(pathDisplay);
            
            // Add parent directory option if not at root
            const isRoot = NL_OS === 'Windows' 
                ? currentPath.length <= 3  // For Windows drives like "C:\"
                : currentPath === '/';
                
            if (!isRoot) {
                const parentItem = document.createElement('div');
                parentItem.className = 'file-item parent-dir';
                parentItem.innerHTML = `
                    <i class="fas fa-level-up-alt"></i>
                    <span>..</span>
                `;
                parentItem.addEventListener('click', () => this.navigateToParentDirectory());
                fileList.appendChild(parentItem);
            }

            // Sort entries: directories first, then files
            const sortedEntries = entries.sort((a, b) => {
                if (a.type === b.type) {
                    return a.entry.localeCompare(b.entry);
                }
                return a.type === 'DIRECTORY' ? -1 : 1;
            });

            sortedEntries.forEach(entry => {
                const item = document.createElement('div');
                item.className = `file-item ${entry.type.toLowerCase()}`;
                
                // Get file extension for icon selection
                const fileExtension = entry.type === 'FILE' ? entry.entry.split('.').pop().toLowerCase() : '';
                const iconClass = this.getFileIcon(fileExtension, entry.type);
                
                item.innerHTML = `
                    <i class="${iconClass}"></i>
                    <span class="file-name">${entry.entry}</span>
                    <div class="file-actions">
                        ${entry.type === 'FILE' ? `
                            <button class="action-btn" data-action="open" title="Open">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                            <button class="action-btn" data-action="preview" title="Preview">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="action-btn" data-action="delete" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
                
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.action-btn')) {
                        const action = e.target.closest('.action-btn').dataset.action;
                        const filePath = NL_OS === 'Windows' 
                            ? `${currentPath}\\${entry.entry}`
                            : `${currentPath}/${entry.entry}`;
                            
                        if (action === 'open') {
                            this.openFile(filePath);
                        } else if (action === 'preview') {
                            this.previewFile(filePath);
                        } else if (action === 'delete') {
                            this.deleteFile(filePath);
                        }
                    } else if (entry.type === 'DIRECTORY') {
                        this.handleFileClick(entry);
                    }
                });
                
                fileList.appendChild(item);
            });
        } catch (error) {
            this.log('Error loading files: ' + error.message, 'error');
        }
    },

    // Updated handleFileClick function
    async handleFileClick(entry) {
        try {
            const currentPath = await this.getCurrentDirectory();
            if (entry.type === 'DIRECTORY') {
                const newPath = NL_OS === 'Windows'
                    ? `${currentPath}\\${entry.entry}`
                    : `${currentPath}/${entry.entry}`;
                this.state.fileExplorer.currentPath = newPath;
                await this.loadFileExplorer();
            } else {
                const filePath = NL_OS === 'Windows'
                    ? `${currentPath}\\${entry.entry}`
                    : `${currentPath}/${entry.entry}`;
                await this.previewFile(filePath);
            }
        } catch (error) {
            this.log('Error handling file click: ' + error.message, 'error');
        }
    },

    // Updated navigateToParentDirectory function
    async navigateToParentDirectory() {
        try {
            const currentPath = await this.getCurrentDirectory();
            const separator = NL_OS === 'Windows' ? '\\' : '/';
            const parts = currentPath.split(separator);
            
            // Handle Windows root directory (e.g., "C:\")
            if (NL_OS === 'Windows' && parts.length <= 2) {
                return; // Already at root
            }
            
            const parentPath = parts.slice(0, -1).join(separator);
            this.state.fileExplorer.currentPath = parentPath || separator;
            await this.loadFileExplorer();
        } catch (error) {
            this.log('Error navigating to parent directory: ' + error.message, 'error');
        }
    },

    async deleteFile(filePath) {
        try {
            const fileName = filePath.split(/[\\/]/).pop();
            
            const cleanPath = filePath.replace(/\t/g, '').trim();
            const encodedPath = cleanPath.replace(/'/g, "\\'");
            
            const modalContent = `
                <div class="delete-confirmation">
                    <i class="fas fa-exclamation-triangle warning-icon"></i>
                    <p>Are you sure you want to delete <strong>${fileName}</strong>?</p>
                    <p class="warning-text">This action cannot be undone.</p>
                    <div class="modal-buttons">
                        <button class="btn btn-danger" onclick="app.confirmDelete('${encodedPath}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                        <button class="btn" onclick="app.closeModal()">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;

            this.showModal('Confirm Delete', modalContent);
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to initiate delete', 'ERROR');
            this.log('Error initiating delete: ' + error.message, 'error');
        }
    },

    async confirmDelete(filePath) {
        try {
            const fileName = filePath.split(/[\\/]/).pop();
            
            // Clean up the file path
            const cleanPath = filePath.replace(/\t/g, '').trim();
            
            await Neutralino.filesystem.remove(cleanPath);
            this.closeModal();
            await Neutralino.os.showNotification('Success', `File deleted: ${fileName}`, 'INFO');
            this.log(`File deleted: ${fileName}`, 'success');
            await this.loadFileExplorer(); // Refresh the file list
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to delete file', 'ERROR');
            this.log('Error deleting file: ' + error.message, 'error');
            this.closeModal();
        }
    },

    async promptUser(title, message) {
        return new Promise((resolve) => {
            this.showModal(title, `
                <div class="modal-form">
                    <p>${message}</p>
                    <input type="text" id="promptInput" class="modal-input">
                    <div class="modal-buttons">
                        <button onclick="app.handlePromptResponse(true)">OK</button>
                        <button onclick="app.handlePromptResponse(false)">Cancel</button>
                    </div>
                </div>
            `);
            this.promptResolve = resolve;
        });
    },

    handlePromptResponse(confirmed) {
        const value = confirmed ? document.getElementById('promptInput').value : null;
        this.closeModal();
        this.promptResolve(value);
    },

    async confirmDialog(title, message) {
        return new Promise((resolve) => {
            this.showModal(title, `
                <div class="modal-form">
                    <p>${message}</p>
                    <div class="modal-buttons">
                        <button onclick="app.handleConfirmResponse(true)">Yes</button>
                        <button onclick="app.handleConfirmResponse(false)">No</button>
                    </div>
                </div>
            `);
            this.confirmResolve = resolve;
        });
    },

    handleConfirmResponse(confirmed) {
        this.closeModal();
        this.confirmResolve(confirmed);
    },

    async copyToClipboard() {
        const text = document.getElementById('clipboardText').value;
        try {
            await Neutralino.clipboard.writeText(text);
            this.log('Text copied to clipboard', 'success');
        } catch (error) {
            await Neutralino.os.showNotification(
                'Permission Error', 
                'Clipboard access is not enabled in app configuration', 
                'ERROR'
            );
            this.log('Error: Clipboard access is not enabled in app configuration. Please add clipboard permissions to neutralino.config.json', 'error');
        }
    },

    async pasteFromClipboard() {
        try {
            const text = await Neutralino.clipboard.readText();
            document.getElementById('clipboardText').value = text;
            this.log('Text pasted from clipboard', 'success');
        } catch (error) {
            await Neutralino.os.showNotification(
                'Permission Error', 
                'Clipboard access is not enabled in app configuration', 
                'ERROR'
            );
            this.log('Error: Clipboard access is not enabled in app configuration. Please add clipboard permissions to neutralino.config.json', 'error');
        }
    },

    async executeCommand() {
        const command = document.getElementById('commandInput').value;
        try {
            const result = await Neutralino.os.execCommand(command);
            document.getElementById('commandOutput').textContent = result.stdout || result.stderr;
            this.log('Command executed successfully', 'success');
        } catch (error) {
            this.log('Error executing command: ' + error.message, 'error');
        }
    },

    showModal(title, content) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modal').classList.add('active');
    },

    closeModal() {
        document.getElementById('modal').classList.remove('active');
    },

  
    formatBytes(bytes) {
        if (bytes === 0 || !bytes) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    log(message, type = 'info') {
        const output = document.getElementById('output');
        const timestamp = new Date().toLocaleTimeString();
        output.innerHTML += `[${timestamp}] <span class="${type}">${message}</span>\n`;
        output.scrollTop = output.scrollHeight;
    },

    clearConsole() {
        document.getElementById('output').innerHTML = '';
        this.log('Console cleared', 'info');
    },

    // Loading State Management
    showLoading() {
        document.getElementById('loading').classList.add('active');
    },
    
    hideLoading() {
        document.getElementById('loading').classList.remove('active');
    },

    async withLoading(operation) {
        this.showLoading();
        try {
            await operation();
        } catch (error) {
            this.log(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    },

    
    async openFile(filePath) {
        try {
            await Neutralino.os.open(filePath);
            this.log(`Opened file: ${filePath}`, 'success');
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to open file', 'ERROR');
            this.log('Error opening file: ' + error.message, 'error');
        }
    },

    // Add helper function for file icons
    getFileIcon(extension, type) {
        if (type === 'DIRECTORY') return 'fas fa-folder';
        
        const iconMap = {
            'pdf': 'fas fa-file-pdf',
            'doc': 'fas fa-file-word',
            'docx': 'fas fa-file-word',
            'xls': 'fas fa-file-excel',
            'xlsx': 'fas fa-file-excel',
            'ppt': 'fas fa-file-powerpoint',
            'pptx': 'fas fa-file-powerpoint',
            'jpg': 'fas fa-file-image',
            'jpeg': 'fas fa-file-image',
            'png': 'fas fa-file-image',
            'gif': 'fas fa-file-image',
            'mp3': 'fas fa-file-audio',
            'wav': 'fas fa-file-audio',
            'mp4': 'fas fa-file-video',
            'mov': 'fas fa-file-video',
            'zip': 'fas fa-file-archive',
            'rar': 'fas fa-file-archive',
            'txt': 'fas fa-file-alt',
            'js': 'fab fa-js',
            'html': 'fab fa-html5',
            'css': 'fab fa-css3',
            'json': 'fas fa-file-code'
        };

        return iconMap[extension] || 'fas fa-file';
    },

    // Updated previewFile function
    async previewFile(filePath) {
        try {
            const content = await Neutralino.filesystem.readFile(filePath);
            const fileName = filePath.split(/[\\/]/).pop();
            const fileExtension = fileName.split('.').pop().toLowerCase();
            
            // Get language for syntax highlighting
            const language = this.getFileLanguage(fileExtension);
            
            // Format the content based on file type
            let formattedContent = content;
            if (this.isImageFile(fileExtension)) {
                formattedContent = `<img src="file://${filePath}" alt="${fileName}" style="max-width: 100%; height: auto;">`;
            } else {
                // Escape HTML characters for code display
                formattedContent = content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            const modalContent = `
                <div class="preview-header">
                    <div class="preview-file-info">
                        <i class="${this.getFileIcon(fileExtension, 'FILE')}"></i>
                        <span>${fileName}</span>
                    </div>
                    <div class="preview-actions">
                        <button class="btn" onclick="app.copyToClipboard('${filePath}')">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
                <div class="preview-content ${this.isImageFile(fileExtension) ? 'image-preview' : 'code-preview'}">
                    ${this.isImageFile(fileExtension) ? formattedContent : `
                        <pre><code class="language-${language}">${formattedContent}</code></pre>
                    `}
                </div>
            `;

            this.showModal(`Preview: ${fileName}`, modalContent);

            // Apply syntax highlighting if it's a code file
            if (!this.isImageFile(fileExtension)) {
                Prism.highlightAll();
            }
        } catch (error) {
            await Neutralino.os.showNotification('Error', 'Failed to preview file', 'ERROR');
            this.log('Error previewing file: ' + error.message, 'error');
        }
    },

    
    isImageFile(extension) {
        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension.toLowerCase());
    },

    
    getFileLanguage(extension) {
        const languageMap = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'md': 'markdown',
            'sql': 'sql',
            'php': 'php',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'go': 'go',
            'rb': 'ruby',
            'rs': 'rust',
            'swift': 'swift',
            'kt': 'kotlin',
            'sh': 'bash',
            'bat': 'batch',
            'ps1': 'powershell',
            'yaml': 'yaml',
            'yml': 'yaml',
            'txt': 'plaintext'
        };
        return languageMap[extension.toLowerCase()] || 'plaintext';
    }
};


Neutralino.events.on('windowClose', () => {
    Neutralino.app.exit();
});

Neutralino.events.on('windowMaximize', () => {
    app.log('Window maximized', 'info');
});

Neutralino.events.on('windowRestore', () => {
    app.log('Window restored', 'info');
});


window.onerror = (msg, url, lineNo, columnNo, error) => {
    app.log(`Error: ${msg}`, 'error');
    return false;
};

window.onunhandledrejection = (event) => {
    app.log(`Unhandled Promise Rejection: ${event.reason}`, 'error');
};