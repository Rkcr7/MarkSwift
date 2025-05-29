document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileListSection = document.getElementById('file-list-section');
    const fileList = document.getElementById('file-list');
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

    // Drag and Drop
    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('border-blue-500', 'bg-blue-50');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('border-blue-500', 'bg-blue-50');
    });

    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('border-blue-500', 'bg-blue-50');
        const files = Array.from(event.dataTransfer.files).filter(file => file.name.endsWith('.md') || file.name.endsWith('.markdown'));
        handleFiles(files);
    });

    // File Input
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files).filter(file => file.name.endsWith('.md') || file.name.endsWith('.markdown'));
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
            fileListSection.classList.add('hidden');
            return;
        }
        fileListSection.classList.remove('hidden');
        fileList.innerHTML = ''; // Clear existing list
        selectedFiles.forEach((file, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            listItem.classList.add(
                'text-gray-700', 
                'py-2', // Increased padding
                'px-2', // Added horizontal padding for better spacing
                'flex', 
                'justify-between', 
                'items-center',
                'hover:bg-gray-50', // Hover effect
                'transition-colors', // Smooth transition for hover
                'duration-150'
            );
            if (index > 0) {
                listItem.classList.add('border-t', 'border-gray-100'); // Top border for separation
            }
            
            const removeButton = document.createElement('button');
            removeButton.innerHTML = '&#x1F5D1;'; // Unicode trash icon
            removeButton.classList.add('ml-4', 'text-red-500', 'hover:text-red-700', 'text-xl', 'leading-none'); // Adjusted styling for icon
            removeButton.setAttribute('aria-label', 'Remove file');
            removeButton.onclick = () => {
                selectedFiles.splice(index, 1);
                updateFileList();
                updateConvertButtonState();
            };
            listItem.appendChild(removeButton);
            fileList.appendChild(listItem);
        });
    }

    function updateConvertButtonState() {
        convertButton.disabled = selectedFiles.length === 0;
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
    }

    function showDownloadLink(url, type) {
        clearMessages();
        statusMessage.textContent = `Conversion complete! Your ${type} is ready for download.`;
        statusArea.classList.remove('hidden');
        downloadLink.href = url;
        downloadLink.textContent = `Download ${type.toUpperCase()}`;
        downloadArea.classList.remove('hidden');
    }


    // Convert Button Click
    convertButton.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one Markdown file.');
            return;
        }
        clearMessages();
        showStatus('Preparing to convert...', true, 0);
        convertButton.disabled = true;

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('markdownFiles', file);
        });

        const selectedMode = document.querySelector('input[name="conversion-mode"]:checked').value;
        formData.append('mode', selectedMode);

        try {
            showStatus('Uploading files...', true, 25); // Simulate progress
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData,
            });

            // Simulate conversion progress
            showStatus('Converting files...', true, 50);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
            showStatus('Processing PDFs...', true, 75);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred during conversion.' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            showStatus('Finalizing...', true, 100);
            
            if (result.downloadUrl) {
                showDownloadLink(result.downloadUrl, result.type);
            } else {
                throw new Error('Conversion failed or no download URL provided.');
            }

        } catch (error) {
            console.error('Conversion error:', error);
            showError(`Error: ${error.message}`);
        } finally {
            convertButton.disabled = false;
            // Optionally clear selected files after conversion attempt
            // selectedFiles = [];
            // updateFileList();
            // updateConvertButtonState();
        }
    });

    // Initial state
    updateConvertButtonState();

    // Reset Button Click
    resetButton.addEventListener('click', () => {
        selectedFiles = [];
        updateFileList();
        updateConvertButtonState();
        clearMessages();
        // Reset conversion mode to default (e.g., 'normal')
        const defaultModeRadio = document.querySelector('input[name="conversion-mode"][value="normal"]');
        if (defaultModeRadio) {
            defaultModeRadio.checked = true;
        }
        // Clear file input value to allow re-selection of the same file if needed
        if (fileInput) {
            fileInput.value = '';
        }
    });
});
