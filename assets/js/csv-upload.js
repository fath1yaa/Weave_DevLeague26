/**
 * Weave - CSV Upload Module
 * 
 * Handles drag-and-drop file selection, client-side validation,
 * AJAX upload to the backend, and result display.
 */

'use strict';

const CSVUpload = (() => {
    // Configuration
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_EXTENSION = '.csv';
    const UPLOAD_ENDPOINT = '../api/upload.php';

    // File type definitions
    const FILE_TYPES = {
        roles: {
            inputId: 'roles-file-input',
            dropZoneId: 'roles-drop-zone',
            fileInfoId: 'roles-file-info',
            fileNameId: 'roles-file-name',
            fieldName: 'roles_csv'
        },
        people: {
            inputId: 'people-file-input',
            dropZoneId: 'people-drop-zone',
            fileInfoId: 'people-file-info',
            fileNameId: 'people-file-name',
            fieldName: 'people_csv'
        },
        events: {
            inputId: 'events-file-input',
            dropZoneId: 'events-drop-zone',
            fileInfoId: 'events-file-info',
            fileNameId: 'events-file-name',
            fieldName: 'events_csv'
        }
    };

    // State
    const selectedFiles = {
        roles: null,
        people: null,
        events: null
    };

    let isUploading = false;

    // DOM References
    let uploadForm;
    let uploadBtn;
    let resetBtn;
    let progressSection;
    let progressBarFill;
    let progressMessage;
    let resultsSection;

    /**
     * Initialise the upload module
     */
    function init() {
        uploadForm = document.getElementById('upload-form');
        uploadBtn = document.getElementById('upload-btn');
        resetBtn = document.getElementById('reset-btn');
        progressSection = document.getElementById('upload-progress');
        progressBarFill = document.getElementById('progress-bar-fill');
        progressMessage = document.getElementById('progress-message');
        resultsSection = document.getElementById('results-section');

        if (!uploadForm) return;

        setupDropZones();
        setupFormEvents();
        setupRemoveButtons();
    }

    /**
     * Set up drag-and-drop handlers for each upload zone
     */
    function setupDropZones() {
        Object.keys(FILE_TYPES).forEach(type => {
            const config = FILE_TYPES[type];
            const dropZone = document.getElementById(config.dropZoneId);
            const fileInput = document.getElementById(config.inputId);

            if (!dropZone || !fileInput) return;

            // Prevent default drag behaviours on the whole document
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            // Highlight on drag enter/over
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('dragover');
                });
            });

            // Remove highlight on drag leave/drop
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('dragover');
                });
            });

            // Handle dropped files
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFileSelection(type, files[0]);
                }
            });

            // Handle file input change
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileSelection(type, e.target.files[0]);
                }
            });

            // Keyboard support for drop zone
            dropZone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInput.click();
                }
            });
        });
    }

    /**
     * Set up form submission and reset events
     */
    function setupFormEvents() {
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!isUploading) {
                uploadFiles();
            }
        });

        uploadForm.addEventListener('reset', (e) => {
            e.preventDefault();
            resetForm();
        });
    }

    /**
     * Set up remove file buttons
     */
    function setupRemoveButtons() {
        document.querySelectorAll('.remove-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.getAttribute('data-target');
                removeFile(type);
            });
        });
    }

    /**
     * Handle a file being selected (via drop or file picker)
     * @param {string} type - File type (roles, people, events)
     * @param {File} file - The selected file
     */
    function handleFileSelection(type, file) {
        // Validate file extension
        if (!file.name.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
            Toast.error(`Invalid file type: "${file.name}". Only .csv files are accepted.`);
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            Toast.error(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 10MB.`);
            return;
        }

        // Validate file is not empty
        if (file.size === 0) {
            Toast.error(`File "${file.name}" is empty. Please select a valid CSV file.`);
            return;
        }

        // Store the file
        selectedFiles[type] = file;

        // Update UI
        const config = FILE_TYPES[type];
        const dropZone = document.getElementById(config.dropZoneId);
        const fileInfo = document.getElementById(config.fileInfoId);
        const fileName = document.getElementById(config.fileNameId);

        dropZone.classList.add('has-file');
        fileInfo.classList.remove('hidden');
        fileName.textContent = file.name;

        // Update submit button state
        updateSubmitButton();

        // Emit event
        EventBus.emit('upload:fileSelected', { type, file });
    }

    /**
     * Remove a selected file
     * @param {string} type - File type to remove
     */
    function removeFile(type) {
        selectedFiles[type] = null;

        const config = FILE_TYPES[type];
        const dropZone = document.getElementById(config.dropZoneId);
        const fileInput = document.getElementById(config.inputId);
        const fileInfo = document.getElementById(config.fileInfoId);
        const fileName = document.getElementById(config.fileNameId);

        dropZone.classList.remove('has-file');
        fileInfo.classList.add('hidden');
        fileName.textContent = '';
        fileInput.value = '';

        updateSubmitButton();

        EventBus.emit('upload:fileRemoved', { type });
    }

    /**
     * Update the submit button disabled state
     */
    function updateSubmitButton() {
        const hasAnyFile = Object.values(selectedFiles).some(file => file !== null);
        uploadBtn.disabled = !hasAnyFile || isUploading;
    }

    /**
     * Upload the selected files to the server
     */
    async function uploadFiles() {
        const filesToUpload = Object.entries(selectedFiles).filter(([, file]) => file !== null);

        if (filesToUpload.length === 0) {
            Toast.warning('Please select at least one CSV file to upload.');
            return;
        }

        isUploading = true;
        updateSubmitButton();
        showProgress('Uploading files...');
        hideResults();

        // Build FormData
        const formData = new FormData();
        filesToUpload.forEach(([type, file]) => {
            const config = FILE_TYPES[type];
            formData.append(config.fieldName, file);
        });

        try {
            // Simulate progress for better UX
            animateProgress(0, 70, 1500);

            const response = await fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });

            // Complete progress
            animateProgress(70, 100, 300);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Upload failed with status ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                showResults(data.summary);
                Toast.success('Files uploaded and processed successfully!');
                resetForm();
                EventBus.emit('upload:complete', data.summary);
            } else {
                throw new Error(data.message || 'Upload processing failed');
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                Toast.error('Network error: Unable to reach server. Please check your connection.');
            } else {
                Toast.error(error.message || 'An error occurred during upload.');
            }
            EventBus.emit('upload:error', { error: error.message });
        } finally {
            isUploading = false;
            updateSubmitButton();
            hideProgress();
        }
    }

    /**
     * Animate the progress bar from start to end percentage
     * @param {number} start - Start percentage
     * @param {number} end - End percentage
     * @param {number} duration - Animation duration in ms
     */
    function animateProgress(start, end, duration) {
        const startTime = Date.now();

        function update() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = start + (end - start) * progress;

            setProgress(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    /**
     * Set the progress bar value
     * @param {number} percent - Progress percentage (0-100)
     */
    function setProgress(percent) {
        if (progressBarFill) {
            progressBarFill.style.width = `${percent}%`;
            progressBarFill.setAttribute('aria-valuenow', Math.round(percent));
        }
    }

    /**
     * Show the progress section
     * @param {string} message - Progress message to display
     */
    function showProgress(message) {
        if (progressSection) {
            progressSection.classList.remove('hidden');
            setProgress(0);
        }
        if (progressMessage) {
            progressMessage.textContent = message;
        }
    }

    /**
     * Hide the progress section
     */
    function hideProgress() {
        if (progressSection) {
            progressSection.classList.add('hidden');
            setProgress(0);
        }
    }

    /**
     * Show the results section with data from the server
     * @param {Object} summary - Upload summary object
     */
    function showResults(summary) {
        if (!resultsSection) return;

        resultsSection.classList.remove('hidden');

        const rolesCount = document.getElementById('roles-imported-count');
        const peopleCount = document.getElementById('people-imported-count');
        const eventsCount = document.getElementById('events-imported-count');
        const flaggedCount = document.getElementById('flagged-count');

        if (rolesCount) rolesCount.textContent = summary.roles_imported || 0;
        if (peopleCount) peopleCount.textContent = summary.people_imported || 0;
        if (eventsCount) eventsCount.textContent = summary.events_imported || 0;
        if (flaggedCount) flaggedCount.textContent = summary.flagged || 0;
    }

    /**
     * Hide the results section
     */
    function hideResults() {
        if (resultsSection) {
            resultsSection.classList.add('hidden');
        }
    }

    /**
     * Reset the form to its initial state
     */
    function resetForm() {
        Object.keys(FILE_TYPES).forEach(type => {
            removeFile(type);
        });
        hideResults();
    }

    // Public API
    return { init };
})();


// Initialise when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    CSVUpload.init();
});



// ============================================================
// Upload History Module
// ============================================================

const UploadHistory = (() => {
    const HISTORY_ENDPOINT = '../api/upload-history.php';

    let historyTbody;
    let historyEmpty;
    let historyTableWrapper;
    let clearAllBtn;

    function init() {
        historyTbody = document.getElementById('history-tbody');
        historyEmpty = document.getElementById('history-empty');
        historyTableWrapper = document.getElementById('history-table-wrapper');
        clearAllBtn = document.getElementById('clear-all-btn');

        if (!historyTbody) return;

        clearAllBtn.addEventListener('click', handleClearAll);
        loadHistory();

        // Refresh after upload completes
        EventBus.on('upload:complete', () => loadHistory());
    }

    async function loadHistory() {
        try {
            const response = await fetch(HISTORY_ENDPOINT);
            if (!response.ok) return;
            const data = await response.json();

            if (data.success && data.history) {
                renderHistory(data.history);
            }
        } catch (error) {
            console.error('Failed to load upload history:', error);
        }
    }

    function renderHistory(history) {
        if (history.length === 0) {
            historyTableWrapper.classList.add('hidden');
            historyEmpty.classList.remove('hidden');
            return;
        }

        historyTableWrapper.classList.remove('hidden');
        historyEmpty.classList.add('hidden');

        historyTbody.innerHTML = history.map(record => `
            <tr>
                <td><strong>${escapeHtml(record.file_name)}</strong></td>
                <td><span class="badge badge-${getBadgeType(record.file_type)}">${escapeHtml(record.file_type)}</span></td>
                <td>${record.records_imported}</td>
                <td>${record.records_flagged}</td>
                <td>${formatUploadDate(record.uploaded_at)}</td>
                <td>
                    <button class="delete-btn" data-id="${record.id}" aria-label="Remove record for ${escapeHtml(record.file_name)}">
                        &times; Remove
                    </button>
                </td>
            </tr>
        `).join('');

        // Attach delete handlers
        historyTbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => handleDeleteRecord(btn.dataset.id));
        });
    }

    async function handleDeleteRecord(id) {
        if (!confirm('Remove this upload record?')) return;

        try {
            const response = await fetch(`${HISTORY_ENDPOINT}?id=${id}`, { method: 'DELETE' });
            const data = await response.json();

            if (data.success) {
                Toast.success('Record removed.');
                loadHistory();
            } else {
                Toast.error(data.error || 'Failed to remove record.');
            }
        } catch (error) {
            Toast.error('Failed to remove record.');
        }
    }

    async function handleClearAll() {
        if (!confirm('This will delete ALL uploaded data (roles, people, events, flags) and start fresh. Are you sure?')) return;

        try {
            const response = await fetch(`${HISTORY_ENDPOINT}?clear_all=true`, { method: 'DELETE' });
            const data = await response.json();

            if (data.success) {
                Toast.success('All data cleared.');
                loadHistory();
            } else {
                Toast.error(data.error || 'Failed to clear data.');
            }
        } catch (error) {
            Toast.error('Failed to clear data.');
        }
    }

    function getBadgeType(fileType) {
        const map = { roles: 'primary', people: 'success', events: 'warning' };
        return map[fileType] || 'info';
    }

    function formatUploadDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    return { init, loadHistory };
})();

document.addEventListener('DOMContentLoaded', () => {
    UploadHistory.init();
});
