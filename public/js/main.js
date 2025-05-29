document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileListSection = document.getElementById('file-list-section');
    const fileList = document.getElementById('file-list');
    const emptyState = document.getElementById('empty-state');
    const fileCount = document.getElementById('file-count');
    const convertButton = document.getElementById('convert-button');
    const modeRadios = document.querySelectorAll('input[name="conversion-mode"]');

    const statusArea = document.getElementById('status-area');
    const statusMessage = document.getElementById('status-message');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    
    const downloadArea = document.getElementById('download-area');
    const downloadLink = document.getElementById('download-link');
    
    const errorArea = document.getElementById('error-area');
    const errorMessage = document.getElementById('error-message');
    const resetButton = document.getElementById('reset-button');

    let selectedFiles = [];

    // Initialize mode selection visual states
    function initializeModeSelection() {
        const modeCards = document.querySelectorAll('.conversion-mode-card');
        modeCards.forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            const indicator = card.querySelector('.mode-indicator div');
            
            card.addEventListener('click', () => {
                radio.checked = true;
                updateModeVisuals();
            });
        });
        updateModeVisuals();
    }

    function updateModeVisuals() {
        const modeCards = document.querySelectorAll('.conversion-mode-card');
        modeCards.forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            const cardDiv = card.querySelector('div');
            const indicator = card.querySelector('.mode-indicator div');
            
            if (radio.checked) {
                cardDiv.classList.add('ring-2', 'ring-offset-2');
                indicator.classList.remove('opacity-0');
                indicator.classList.add('opacity-100');
                
                // Add specific ring colors based on mode
                if (radio.value === 'normal') {
                    cardDiv.classList.add('ring-green-400');
                } else if (radio.value === 'fast') {
                    cardDiv.classList.add('ring-orange-400');
                } else if (radio.value === 'max') {
                    cardDiv.classList.add('ring-red-400');
                }
            } else {
                cardDiv.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-orange-400', 'ring-red-400');
                indicator.classList.add('opacity-0');
                indicator.classList.remove('opacity-100');
            }
        });
    }

    // Enhanced drag and drop with better visual feedback
    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt').classList.add('animate-bounce');
    });

    dropArea.addEventListener('dragleave', (event) => {
        // Only remove styles if we're leaving the drop area completely
        if (!dropArea.contains(event.relatedTarget)) {
            dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
            dropArea.querySelector('.fa-cloud-upload-alt').classList.remove('animate-bounce');
        }
    });

    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt').classList.remove('animate-bounce');
        
        const files = Array.from(event.dataTransfer.files).filter(file => 
            file.name.endsWith('.md') || file.name.endsWith('.markdown')
        );
        handleFiles(files);
    });

    // File Input
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files).filter(file => 
            file.name.endsWith('.md') || file.name.endsWith('.markdown')
        );
        handleFiles(files);
    });

    function handleFiles(files) {
        selectedFiles.push(...files);
        updateFileList();
        updateConvertButtonState();
        clearMessages();
    }

    function updateFileList() {
        if (selectedFiles.length === 0) {
            fileList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            fileCount.classList.add('hidden');
            return;
        }

        fileList.classList.remove('hidden');
        emptyState.classList.add('hidden');
        fileCount.classList.remove('hidden');
        fileCount.textContent = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`;

        fileList.innerHTML = ''; // Clear existing list
        
        selectedFiles.forEach((file, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'group';
            
            // Get file extension for icon
            const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
            const fileSize = (file.size / 1024).toFixed(2);
            
            listItem.innerHTML = `
                <div class="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 group-hover:bg-white/70">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center flex-1 min-w-0">
                            <div class="w-10 h-10 bg-gradient-to-r ${isMarkdown ? 'from-blue-500 to-blue-600' : 'from-purple-500 to-purple-600'} rounded-lg flex items-center justify-center mr-3 shadow-sm">
                                <i class="fab fa-markdown text-white text-lg"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-slate-700 truncate" title="${file.name}">
                                    ${file.name}
                                </div>
                                <div class="text-sm text-slate-500">
                                    ${fileSize} KB
                                </div>
                            </div>
                        </div>
                        <button class="remove-file-btn ml-4 w-8 h-8 bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 rounded-lg flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100" title="Remove file">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            `;
            
            const removeButton = listItem.querySelector('.remove-file-btn');
            removeButton.onclick = (e) => {
                e.stopPropagation();
                removeFile(index);
            };
            
            fileList.appendChild(listItem);
        });
    }

    function removeFile(index) {
        // Add removal animation
        const listItem = fileList.children[index];
        listItem.style.transform = 'translateX(100%)';
        listItem.style.opacity = '0';
        
        setTimeout(() => {
            selectedFiles.splice(index, 1);
            updateFileList();
            updateConvertButtonState();
        }, 200);
    }

    function updateConvertButtonState() {
        const hasFiles = selectedFiles.length > 0;
        convertButton.disabled = !hasFiles;
        
        if (hasFiles) {
            convertButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            convertButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    function clearMessages() {
        statusArea.classList.add('hidden');
        statusMessage.textContent = '';
        progressBarContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        downloadArea.classList.add('hidden');
        downloadLink.href = '#';
        errorArea.classList.add('hidden');
        errorMessage.textContent = '';
    }
    
    function showStatus(message, showProgress = false, progressValue = 0) {
        clearMessages();
        statusMessage.textContent = message;
        statusArea.classList.remove('hidden');
        if (showProgress) {
            progressBarContainer.classList.remove('hidden');
            progressBar.style.width = `${progressValue}%`;
        }
    }

    function showError(message) {
        clearMessages();
        errorMessage.textContent = message;
        errorArea.classList.remove('hidden');
        
        // Add shake animation to error area
        errorArea.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            errorArea.style.animation = '';
        }, 500);
    }

    function showDownloadLink(url, type) {
        clearMessages();
        downloadArea.classList.remove('hidden');
        downloadLink.href = url;
        
        // Add success animation
        downloadArea.style.transform = 'scale(0.9)';
        downloadArea.style.opacity = '0';
        setTimeout(() => {
            downloadArea.style.transform = 'scale(1)';
            downloadArea.style.opacity = '1';
        }, 100);
    }

    // Convert Button Click with enhanced feedback
    convertButton.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one Markdown file.');
            return;
        }
        
        clearMessages();
        showStatus('Preparing to convert...', true, 0);
        convertButton.disabled = true;
        
        // Add loading state to button
        const buttonContent = convertButton.querySelector('span');
        const originalContent = buttonContent.innerHTML;
        buttonContent.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Converting...';

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('markdownFiles', file);
        });

        const selectedMode = document.querySelector('input[name="conversion-mode"]:checked').value;
        formData.append('mode', selectedMode);

        try {
            showStatus('Uploading files...', true, 25);
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData,
            });

            // Simulate conversion progress with better timing
            showStatus('Converting files...', true, 50);
            await new Promise(resolve => setTimeout(resolve, 800));
            showStatus('Processing PDFs...', true, 75);
            await new Promise(resolve => setTimeout(resolve, 600));

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: 'An unknown error occurred during conversion.' 
                }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            showStatus('Finalizing...', true, 100);
            
            if (result.downloadUrl) {
                setTimeout(() => {
                    showDownloadLink(result.downloadUrl, result.type);
                }, 500);
            } else {
                throw new Error('Conversion failed or no download URL provided.');
            }

        } catch (error) {
            console.error('Conversion error:', error);
            showError(`Error: ${error.message}`);
        } finally {
            convertButton.disabled = false;
            buttonContent.innerHTML = originalContent;
            updateConvertButtonState();
        }
    });

    // Reset Button Click with animation
    resetButton.addEventListener('click', () => {
        // Add reset animation
        resetButton.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            resetButton.style.transform = 'rotate(0deg)';
        }, 300);
        
        selectedFiles = [];
        updateFileList();
        updateConvertButtonState();
        clearMessages();
        
        // Reset conversion mode to default
        const defaultModeRadio = document.querySelector('input[name="conversion-mode"][value="normal"]');
        if (defaultModeRadio) {
            defaultModeRadio.checked = true;
            updateModeVisuals();
        }
        
        // Clear file input
        if (fileInput) {
            fileInput.value = '';
        }
    });

    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        .conversion-mode-card {
            transition: all 0.2s ease-in-out;
        }
        
        .conversion-mode-card:hover {
            transform: translateY(-2px);
        }
        
        #file-list li {
            transition: all 0.2s ease-in-out;
        }
        
        #reset-button {
            transition: transform 0.3s ease-in-out;
        }
        
        #download-area {
            transition: all 0.3s ease-in-out;
        }
    `;
    document.head.appendChild(style);

    // Initialize everything
    initializeModeSelection();
    updateConvertButtonState();
});
