/**
 * Weave - Data Quality Module
 *
 * Manages the data quality page: displays quality score gauge,
 * stats cards, category filter tabs, flagged record cards,
 * and inline resolution forms.
 */

'use strict';

const DataQuality = (() => {
    // State
    let stats = null;
    let records = [];
    let activeCategory = 'all';
    let openFormId = null;
    let isSubmitting = false;

    // DOM references
    let loadingEl, contentEl, recordsListEl, emptyStateEl, visibleCountEl;

    // Field definitions per source file type
    const FILE_FIELDS = {
        'roles.csv': [
            { key: 'role_id', label: 'Role ID', required: true },
            { key: 'title', label: 'Title', required: true },
            { key: 'department', label: 'Department', required: true },
            { key: 'reports_to', label: 'Reports To', required: false },
            { key: 'effective_from', label: 'Effective From', required: true, type: 'date' },
            { key: 'effective_to', label: 'Effective To', required: false, type: 'date' }
        ],
        'people.csv': [
            { key: 'person_id', label: 'Person ID', required: true },
            { key: 'name', label: 'Name', required: true },
            { key: 'role_id', label: 'Role ID', required: true },
            { key: 'start_date', label: 'Start Date', required: true, type: 'date' },
            { key: 'end_date', label: 'End Date', required: false, type: 'date' }
        ],
        'events.csv': [
            { key: 'event_id', label: 'Event ID', required: true },
            { key: 'event_type', label: 'Event Type', required: true },
            { key: 'entity_type', label: 'Entity Type', required: true },
            { key: 'entity_id', label: 'Entity ID', required: true },
            { key: 'previous_value', label: 'Previous Value', required: false },
            { key: 'new_value', label: 'New Value', required: false },
            { key: 'effective_date', label: 'Effective Date', required: true, type: 'date' },
            { key: 'description', label: 'Description', required: false }
        ]
    };

    // Issue type labels
    const ISSUE_LABELS = {
        missing_field: 'Missing Field',
        unmatched_reference: 'Unmatched Reference',
        date_conflict: 'Date Conflict',
        duplicate: 'Duplicate'
    };

    /**
     * Initialize the module
     */
    function init() {
        loadingEl = document.getElementById('dq-loading');
        contentEl = document.getElementById('dq-content');
        recordsListEl = document.getElementById('records-list');
        emptyStateEl = document.getElementById('dq-empty-state');
        visibleCountEl = document.getElementById('visible-record-count');

        if (!loadingEl) return;

        setupTabListeners();
        loadData();

        // Listen for upload completion to refresh
        EventBus.on('upload:complete', () => {
            loadData();
        });
    }

    /**
     * Set up category tab click handlers
     */
    function setupTabListeners() {
        const tabs = document.querySelectorAll('.category-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.getAttribute('data-category');
                setActiveCategory(category);
            });
        });
    }

    /**
     * Set the active category filter
     * @param {string} category - Category to filter by
     */
    function setActiveCategory(category) {
        activeCategory = category;

        // Update tab states
        document.querySelectorAll('.category-tab').forEach(tab => {
            const isActive = tab.getAttribute('data-category') === category;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });

        renderRecords();
    }

    /**
     * Load all data from the API
     */
    async function loadData() {
        showLoading();

        try {
            // Fetch stats and records in parallel
            const [statsData, recordsData] = await Promise.all([
                API.get('dataquality.js?action=stats'),
                API.get('dataquality.js?action=list')
            ]);

            stats = statsData;
            records = recordsData.flagged_records || [];

            hideLoading();
            renderDashboard();
            renderTabs();
            renderRecords();
        } catch (error) {
            hideLoading();

            // If API is not available, show empty state with demo data indication
            if (error.status === 0 || error.status === 404) {
                stats = { quality_score: 100, total_records: 0, flagged: 0, resolved: 0, unresolved: 0, categories: {} };
                records = [];
                contentEl.classList.remove('hidden');
                renderDashboard();
                renderTabs();
                renderRecords();
                Toast.info('Data quality API not available. Upload data to see quality metrics.');
            } else {
                Toast.error('Failed to load data quality information.');
            }
        }
    }

    /**
     * Show loading state
     */
    function showLoading() {
        loadingEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
    }

    /**
     * Hide loading state
     */
    function hideLoading() {
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
    }

    /**
     * Render the quality score gauge and stats
     */
    function renderDashboard() {
        if (!stats) return;

        const score = stats.quality_score || 0;

        // Animate the gauge
        animateGauge(score);

        // Update stats cards
        setStatValue('stat-total', stats.total_records || 0);
        setStatValue('stat-flagged', stats.flagged || 0);
        setStatValue('stat-resolved', stats.resolved || 0);
        setStatValue('stat-unresolved', stats.unresolved || 0);
    }

    /**
     * Animate the radial gauge to a target percentage
     * @param {number} percent - Target percentage (0-100)
     */
    function animateGauge(percent) {
        const gaugeFill = document.getElementById('gauge-fill');
        const gaugePercent = document.getElementById('gauge-percent');
        if (!gaugeFill || !gaugePercent) return;

        const circumference = 2 * Math.PI * 50; // r=50
        const offset = circumference - (percent / 100) * circumference;

        // Set colour based on score
        gaugeFill.classList.remove('warning', 'danger');
        if (percent < 70) {
            gaugeFill.classList.add('danger');
        } else if (percent < 90) {
            gaugeFill.classList.add('warning');
        }

        // Animate with slight delay for visual effect
        requestAnimationFrame(() => {
            gaugeFill.style.strokeDashoffset = offset;
            animateCounter(gaugePercent, 0, percent, 1000);
        });
    }

    /**
     * Animate a counter from start to end value
     * @param {HTMLElement} el - Element to update
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} duration - Animation duration in ms
     */
    function animateCounter(el, start, end, duration) {
        const startTime = Date.now();
        const isDecimal = end % 1 !== 0;

        function update() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * eased;

            el.textContent = isDecimal ? current.toFixed(1) + '%' : Math.round(current) + '%';

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    /**
     * Set a stat card value with animation
     * @param {string} id - Element ID
     * @param {number} value - Value to display
     */
    function setStatValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value.toLocaleString();
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 400);
    }

    /**
     * Render category tab counts
     */
    function renderTabs() {
        const categories = stats?.categories || {};
        const unresolvedRecords = records.filter(r => !r.resolved);
        const totalUnresolved = unresolvedRecords.length;

        document.getElementById('tab-count-all').textContent = totalUnresolved;
        document.getElementById('tab-count-missing_field').textContent = categories.missing_field || 0;
        document.getElementById('tab-count-unmatched_reference').textContent = categories.unmatched_reference || 0;
        document.getElementById('tab-count-date_conflict').textContent = categories.date_conflict || 0;
        document.getElementById('tab-count-duplicate').textContent = categories.duplicate || 0;
    }

    /**
     * Render the list of flagged records based on active category
     */
    function renderRecords() {
        if (!recordsListEl) return;

        // Filter by category
        let filtered = records.filter(r => !r.resolved);
        if (activeCategory !== 'all') {
            filtered = filtered.filter(r => r.issue_type === activeCategory);
        }

        // Update visible count
        if (visibleCountEl) {
            visibleCountEl.textContent = `Showing ${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;
        }

        // Show empty state or records
        if (filtered.length === 0) {
            recordsListEl.innerHTML = '';
            emptyStateEl.classList.remove('hidden');
            return;
        }

        emptyStateEl.classList.add('hidden');

        // Build cards HTML
        recordsListEl.innerHTML = filtered.map(record => buildRecordCard(record)).join('');

        // Attach event listeners to resolve buttons
        recordsListEl.querySelectorAll('.btn-resolve').forEach(btn => {
            btn.addEventListener('click', () => {
                const flagId = parseInt(btn.getAttribute('data-flag-id'));
                toggleResolveForm(flagId);
            });
        });

        // Re-attach form events if one was open
        if (openFormId) {
            attachFormEvents(openFormId);
        }
    }

    /**
     * Build HTML for a single record card
     * @param {Object} record - Flagged record data
     * @returns {string} HTML string
     */
    function buildRecordCard(record) {
        const originalData = typeof record.original_data === 'string'
            ? JSON.parse(record.original_data)
            : record.original_data;

        const issueLabel = ISSUE_LABELS[record.issue_type] || record.issue_type;

        return `
            <div class="record-card ${record.issue_type}" role="listitem" data-flag-id="${record.flag_id || record.id}">
                <div class="record-card-header">
                    <div class="record-card-badges">
                        <span class="badge badge-source">${escapeHtml(record.source_file)}</span>
                        <span class="badge badge-issue ${record.issue_type}">${escapeHtml(issueLabel)}</span>
                    </div>
                    <span class="record-card-row">Row #${record.row_number}</span>
                </div>
                <p class="record-card-description">${escapeHtml(record.issue_description)}</p>
                <div class="record-card-data">
                    <div class="record-data-grid">
                        ${buildOriginalDataHtml(originalData)}
                    </div>
                </div>
                <div class="record-card-actions">
                    <button class="btn btn-primary btn-sm btn-resolve" data-flag-id="${record.flag_id || record.id}" aria-expanded="false" aria-controls="form-${record.flag_id || record.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Resolve
                    </button>
                </div>
                <div id="form-${record.flag_id || record.id}" class="hidden"></div>
            </div>
        `;
    }

    /**
     * Build key-value HTML for original data
     * @param {Object} data - Original record data
     * @returns {string} HTML string
     */
    function buildOriginalDataHtml(data) {
        if (!data || typeof data !== 'object') return '<span class="text-muted">No data available</span>';

        return Object.entries(data).map(([key, value]) => {
            const isEmpty = value === '' || value === null || value === undefined;
            const displayValue = isEmpty ? '(empty)' : String(value);
            const valueClass = isEmpty ? 'record-data-value empty' : 'record-data-value';

            return `
                <span class="record-data-key">${escapeHtml(key)}</span>
                <span class="${valueClass}">${escapeHtml(displayValue)}</span>
            `;
        }).join('');
    }

    /**
     * Toggle the resolution form for a record
     * @param {number} flagId - Flag ID
     */
    function toggleResolveForm(flagId) {
        const formContainer = document.getElementById(`form-${flagId}`);
        const btn = document.querySelector(`.btn-resolve[data-flag-id="${flagId}"]`);

        if (!formContainer) return;

        // If same form is open, close it
        if (openFormId === flagId) {
            formContainer.classList.add('hidden');
            formContainer.innerHTML = '';
            btn.setAttribute('aria-expanded', 'false');
            openFormId = null;
            return;
        }

        // Close any previously open form
        if (openFormId !== null) {
            const prevForm = document.getElementById(`form-${openFormId}`);
            const prevBtn = document.querySelector(`.btn-resolve[data-flag-id="${openFormId}"]`);
            if (prevForm) {
                prevForm.classList.add('hidden');
                prevForm.innerHTML = '';
            }
            if (prevBtn) prevBtn.setAttribute('aria-expanded', 'false');
        }

        // Find record data
        const record = records.find(r => (r.flag_id || r.id) === flagId);
        if (!record) return;

        // Render form
        formContainer.innerHTML = buildResolutionForm(record);
        formContainer.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        openFormId = flagId;

        attachFormEvents(flagId);

        // Focus first input
        const firstInput = formContainer.querySelector('input, select');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    /**
     * Build the resolution form HTML
     * @param {Object} record - Flagged record
     * @returns {string} HTML string
     */
    function buildResolutionForm(record) {
        const originalData = typeof record.original_data === 'string'
            ? JSON.parse(record.original_data)
            : record.original_data;

        const fields = FILE_FIELDS[record.source_file] || [];

        // For duplicates, offer a simpler confirmation
        if (record.issue_type === 'duplicate') {
            return `
                <div class="resolution-form">
                    <div class="resolution-form-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        Resolve Duplicate Record
                    </div>
                    <p class="text-sm" style="color: var(--color-gray-600); margin-bottom: var(--spacing-md);">
                        This record was flagged as a duplicate. Marking it as resolved will dismiss this flag.
                    </p>
                    <div class="resolution-form-actions">
                        <button class="btn btn-primary btn-sm" id="submit-resolve-${record.flag_id || record.id}">
                            Mark as Resolved
                        </button>
                        <button class="btn btn-secondary btn-sm" id="cancel-resolve-${record.flag_id || record.id}">
                            Cancel
                        </button>
                    </div>
                    <div id="form-message-${record.flag_id || record.id}"></div>
                </div>
            `;
        }

        // Build editable fields
        const fieldsHtml = fields.map(field => {
            const currentValue = originalData[field.key] || '';
            const inputType = field.type === 'date' ? 'date' : 'text';
            const requiredAttr = field.required ? 'required' : '';
            const requiredMark = field.required ? ' <span style="color: var(--color-danger);">*</span>' : '';

            return `
                <div class="resolution-field">
                    <label for="resolve-field-${field.key}-${record.flag_id || record.id}">${field.label}${requiredMark}</label>
                    <input type="${inputType}" 
                           id="resolve-field-${field.key}-${record.flag_id || record.id}"
                           name="${field.key}"
                           value="${escapeHtml(currentValue)}"
                           placeholder="Enter ${field.label.toLowerCase()}"
                           ${requiredAttr}>
                    <span class="field-error" id="error-${field.key}-${record.flag_id || record.id}"></span>
                </div>
            `;
        }).join('');

        return `
            <div class="resolution-form">
                <div class="resolution-form-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit &amp; Resolve Record
                </div>
                <form id="resolution-form-${record.flag_id || record.id}" novalidate>
                    <div class="resolution-fields">
                        ${fieldsHtml}
                    </div>
                    <div class="resolution-form-actions">
                        <button type="submit" class="btn btn-primary btn-sm" id="submit-resolve-${record.flag_id || record.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M9 11l3 3L22 4"/>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                            </svg>
                            Save Resolution
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" id="cancel-resolve-${record.flag_id || record.id}">
                            Cancel
                        </button>
                    </div>
                </form>
                <div id="form-message-${record.flag_id || record.id}"></div>
            </div>
        `;
    }

    /**
     * Attach event listeners to a resolution form
     * @param {number} flagId - Flag ID
     */
    function attachFormEvents(flagId) {
        const form = document.getElementById(`resolution-form-${flagId}`);
        const submitBtn = document.getElementById(`submit-resolve-${flagId}`);
        const cancelBtn = document.getElementById(`cancel-resolve-${flagId}`);

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                submitResolution(flagId);
            });
        } else if (submitBtn) {
            // Duplicate type - no form, just a button
            submitBtn.addEventListener('click', () => {
                submitResolution(flagId);
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                toggleResolveForm(flagId);
            });
        }
    }

    /**
     * Submit a resolution for a flagged record
     * @param {number} flagId - Flag ID to resolve
     */
    async function submitResolution(flagId) {
        if (isSubmitting) return;

        const record = records.find(r => (r.flag_id || r.id) === flagId);
        if (!record) return;

        const messageEl = document.getElementById(`form-message-${flagId}`);
        let resolvedData = {};

        // Clear previous messages
        if (messageEl) messageEl.innerHTML = '';

        // Gather form data (skip for duplicates)
        if (record.issue_type !== 'duplicate') {
            const form = document.getElementById(`resolution-form-${flagId}`);
            if (!form) return;

            const fields = FILE_FIELDS[record.source_file] || [];
            let hasErrors = false;

            // Clear previous errors
            form.querySelectorAll('.field-error').forEach(el => {
                el.classList.remove('visible');
                el.textContent = '';
            });
            form.querySelectorAll('input.error').forEach(el => el.classList.remove('error'));

            // Validate and collect
            fields.forEach(field => {
                const input = form.querySelector(`[name="${field.key}"]`);
                if (!input) return;

                const value = input.value.trim();
                resolvedData[field.key] = value;

                if (field.required && !value) {
                    const errorEl = document.getElementById(`error-${field.key}-${flagId}`);
                    if (errorEl) {
                        errorEl.textContent = `${field.label} is required`;
                        errorEl.classList.add('visible');
                    }
                    input.classList.add('error');
                    hasErrors = true;
                }
            });

            if (hasErrors) return;
        } else {
            // For duplicates, send the original data as resolved
            resolvedData = typeof record.original_data === 'string'
                ? JSON.parse(record.original_data)
                : { ...record.original_data };
        }

        // Submit to API
        isSubmitting = true;
        const submitBtn = document.getElementById(`submit-resolve-${flagId}`);
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Saving...';
        }

        try {
            const response = await API.put(`dataquality.js?action=resolve&flag_id=${flagId}`, {
                resolved_data: resolvedData
            });

            if (response.success && response.validation_passed) {
                // Show success
                if (messageEl) {
                    messageEl.innerHTML = `
                        <div class="resolution-success">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M9 11l3 3L22 4"/>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                            </svg>
                            Record resolved successfully!
                        </div>
                    `;
                }

                Toast.success('Record resolved successfully!');
                openFormId = null;

                // Refresh data after a short delay for visual feedback
                setTimeout(() => loadData(), 800);

                EventBus.emit('dataquality:resolved', { flagId });
            } else if (response.success && !response.validation_passed) {
                // Validation failed
                if (messageEl) {
                    messageEl.innerHTML = `
                        <div class="resolution-error">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            ${escapeHtml(response.message || 'Validation failed. Please check your input.')}
                        </div>
                    `;
                }
                Toast.warning('Resolution did not pass validation. Please review and try again.');
            } else {
                throw new Error(response.message || 'Resolution failed');
            }
        } catch (error) {
            if (messageEl) {
                messageEl.innerHTML = `
                    <div class="resolution-error">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        ${escapeHtml(error.message || 'An error occurred while resolving.')}
                    </div>
                `;
            }
            Toast.error(error.message || 'Failed to resolve record.');
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                if (record.issue_type === 'duplicate') {
                    submitBtn.innerHTML = 'Mark as Resolved';
                } else {
                    submitBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        Save Resolution
                    `;
                }
            }
        }
    }

    // Public API
    return { init };
})();

// Initialise when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    DataQuality.init();
});
