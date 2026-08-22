/**
 * Role History - Weave Application
 * 
 * Handles role search with autocomplete, fetches role history from API,
 * and renders a chronological timeline of changes plus occupants list.
 */

'use strict';

const RoleHistory = (() => {
    // DOM elements
    let searchInput, searchDropdown, roleDetail, loadingState;
    let roleTitle, roleIdBadge, roleDepartmentBadge;
    let roleReportsTo, roleEffectiveFrom, roleEffectiveTo;
    let eventsTimeline, occupantsList, btnViewConnections;

    // State
    let currentRoleId = null;

    /**
     * Initialise the role history page
     */
    function init() {
        cacheElements();
        bindEvents();
        checkUrlParams();
    }

    /**
     * Cache DOM element references
     */
    function cacheElements() {
        searchInput = document.getElementById('role-search');
        searchDropdown = document.getElementById('search-results');
        roleDetail = document.getElementById('role-detail');
        loadingState = document.getElementById('loading-state');
        roleTitle = document.getElementById('role-title');
        roleIdBadge = document.getElementById('role-id-badge');
        roleDepartmentBadge = document.getElementById('role-department-badge');
        roleReportsTo = document.getElementById('role-reports-to');
        roleEffectiveFrom = document.getElementById('role-effective-from');
        roleEffectiveTo = document.getElementById('role-effective-to');
        eventsTimeline = document.getElementById('events-timeline');
        occupantsList = document.getElementById('occupants-list');
        btnViewConnections = document.getElementById('btn-view-connections');
    }

    /**
     * Bind event listeners
     */
    function bindEvents() {
        // Search input with debounce
        searchInput.addEventListener('input', debounce(handleSearch, 300));

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) {
                hideDropdown();
            }
        });

        // Keyboard navigation for dropdown
        searchInput.addEventListener('keydown', handleSearchKeydown);

        // View connections button
        btnViewConnections.addEventListener('click', () => {
            if (currentRoleId) {
                Nav.goTo('pages/connections.html', { type: 'role', id: currentRoleId });
            }
        });
    }

    /**
     * Check URL params for direct role loading
     */
    function checkUrlParams() {
        const roleId = Nav.getParam('role_id');
        if (roleId) {
            loadRoleHistory(roleId);
        }
    }

    /**
     * Handle search input
     */
    async function handleSearch() {
        const query = searchInput.value.trim();

        if (query.length < 1) {
            hideDropdown();
            return;
        }

        try {
            const data = await API.get(`roles.php?action=search&q=${encodeURIComponent(query)}`);
            if (data.success && data.results.length > 0) {
                renderSearchResults(data.results);
                showDropdown();
            } else {
                renderNoResults();
                showDropdown();
            }
        } catch (error) {
            console.error('Search failed:', error);
            Toast.error('Failed to search roles. Please try again.');
        }
    }

    /**
     * Handle keyboard navigation in search dropdown
     */
    function handleSearchKeydown(e) {
        const items = searchDropdown.querySelectorAll('.search-dropdown-item');
        if (items.length === 0) return;

        const activeItem = searchDropdown.querySelector('.search-dropdown-item:focus');
        let index = Array.from(items).indexOf(activeItem);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                index = Math.min(index + 1, items.length - 1);
                items[index].focus();
                break;
            case 'ArrowUp':
                e.preventDefault();
                index = Math.max(index - 1, 0);
                items[index].focus();
                break;
            case 'Enter':
                if (activeItem) {
                    e.preventDefault();
                    activeItem.click();
                }
                break;
            case 'Escape':
                hideDropdown();
                searchInput.blur();
                break;
        }
    }

    /**
     * Render search results in dropdown
     */
    function renderSearchResults(results) {
        searchDropdown.innerHTML = results.map(role => `
            <div class="search-dropdown-item" 
                 role="option" 
                 tabindex="0"
                 data-role-id="${escapeHtml(role.role_id)}"
                 aria-label="${escapeHtml(role.title)} - ${escapeHtml(role.department || 'No department')}">
                <div>
                    <div class="item-title">${escapeHtml(role.title)}</div>
                    <div class="item-meta">${escapeHtml(role.role_id)} &middot; ${escapeHtml(role.department || 'No department')}</div>
                </div>
                <div class="item-occupant">
                    ${role.current_occupant ? escapeHtml(role.current_occupant) : '<em>Vacant</em>'}
                </div>
            </div>
        `).join('');

        // Bind click events to results
        searchDropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const roleId = item.dataset.roleId;
                searchInput.value = item.querySelector('.item-title').textContent;
                hideDropdown();
                loadRoleHistory(roleId);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    item.click();
                }
            });
        });
    }

    /**
     * Render no results message
     */
    function renderNoResults() {
        searchDropdown.innerHTML = `
            <div class="search-dropdown-item" style="cursor: default; justify-content: center;">
                <span class="text-muted">No roles found matching your search.</span>
            </div>
        `;
    }

    /**
     * Load role history data from API
     */
    async function loadRoleHistory(roleId) {
        currentRoleId = roleId;
        showLoading();
        hideDetail();

        try {
            const data = await API.get(`roles.php?action=history&role_id=${encodeURIComponent(roleId)}`);
            if (data.success) {
                renderRoleDetail(data.role);
                renderTimeline(data.events);
                renderOccupants(data.occupants);
                showDetail();
            } else {
                Toast.error('Role not found.');
            }
        } catch (error) {
            console.error('Failed to load role history:', error);
            Toast.error('Failed to load role history. Please try again.');
        } finally {
            hideLoading();
        }
    }

    /**
     * Render the role detail header
     */
    function renderRoleDetail(role) {
        roleTitle.textContent = role.title;
        roleIdBadge.textContent = role.role_id;
        roleDepartmentBadge.textContent = role.department || 'No department';

        // Reports to - make clickable link if a reports_to value exists
        if (role.reports_to) {
            roleReportsTo.innerHTML = `<a onclick="RoleHistory.loadRole('${escapeHtml(role.reports_to)}')">${escapeHtml(role.reports_to)}</a>`;
        } else {
            roleReportsTo.textContent = 'None (top-level)';
        }

        roleEffectiveFrom.textContent = formatDate(role.effective_from);
        roleEffectiveTo.textContent = role.effective_to ? formatDate(role.effective_to) : 'Present';
    }

    /**
     * Render the events timeline
     */
    function renderTimeline(events) {
        if (!events || events.length === 0) {
            eventsTimeline.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No change events recorded for this role.</p>
                </div>
            `;
            return;
        }

        eventsTimeline.innerHTML = events.map(event => {
            const eventTypeLabel = event.event_type.replace(/_/g, ' ');
            let changeHtml = '';

            if (event.previous_value || event.new_value) {
                changeHtml = `
                    <div class="timeline-change">
                        ${event.previous_value ? `<span class="prev-value">${escapeHtml(event.previous_value)}</span>` : ''}
                        ${event.previous_value && event.new_value ? '<span class="arrow">&rarr;</span>' : ''}
                        ${event.new_value ? `<span class="new-value">${escapeHtml(event.new_value)}</span>` : ''}
                    </div>
                `;
            }

            return `
                <div class="timeline-item">
                    <div class="timeline-dot ${event.event_type}"></div>
                    <div class="timeline-date">${formatDate(event.effective_date)}</div>
                    <div class="timeline-event-type">${escapeHtml(eventTypeLabel)}</div>
                    ${event.description ? `<div class="timeline-description">${escapeHtml(event.description)}</div>` : ''}
                    ${changeHtml}
                </div>
            `;
        }).join('');
    }

    /**
     * Render the occupants list
     */
    function renderOccupants(occupants) {
        if (!occupants || occupants.length === 0) {
            occupantsList.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No occupant records found.</p>
                </div>
            `;
            return;
        }

        occupantsList.innerHTML = occupants.map(occ => {
            const isCurrent = !occ.end_date;
            const dateRange = `${formatDate(occ.start_date)} — ${occ.end_date ? formatDate(occ.end_date) : 'Present'}`;

            return `
                <div class="occupant-item ${isCurrent ? 'current' : ''}" 
                     onclick="Nav.goToPersonJourney('${escapeHtml(occ.person_id)}')"
                     role="button"
                     tabindex="0"
                     aria-label="View journey for ${escapeHtml(occ.name)}">
                    <div>
                        <div class="occupant-name">${escapeHtml(occ.name)}</div>
                        <div class="occupant-dates">${dateRange}</div>
                    </div>
                    ${isCurrent ? '<span class="occupant-badge">Current</span>' : ''}
                </div>
            `;
        }).join('');

        // Keyboard support for occupant items
        occupantsList.querySelectorAll('.occupant-item').forEach(item => {
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') item.click();
            });
        });
    }

    // UI helpers
    function showDropdown() { searchDropdown.classList.remove('hidden'); }
    function hideDropdown() { searchDropdown.classList.add('hidden'); }
    function showDetail() { roleDetail.classList.remove('hidden'); }
    function hideDetail() { roleDetail.classList.add('hidden'); }
    function showLoading() { loadingState.classList.remove('hidden'); }
    function hideLoading() { loadingState.classList.add('hidden'); }

    /**
     * Public method to load a role (used by reports_to link)
     */
    function loadRole(roleId) {
        searchInput.value = '';
        loadRoleHistory(roleId);
    }

    return { init, loadRole, loadRoleHistory };
})();

// Initialise when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    RoleHistory.init();
});
