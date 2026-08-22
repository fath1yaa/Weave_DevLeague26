/**
 * Person Journey - Weave Application
 * 
 * Handles person search with autocomplete, fetches person journey from API,
 * and renders a career path (role assignments) plus chronological transition timeline.
 */

'use strict';

const PersonJourney = (() => {
    // DOM elements
    let searchInput, searchDropdown, personDetail, loadingState;
    let personAvatar, personName, personIdBadge, personCurrentRole;
    let careerPath, eventsTimeline, btnViewConnections;

    // State
    let currentPersonId = null;

    /**
     * Initialise the person journey page
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
        searchInput = document.getElementById('person-search');
        searchDropdown = document.getElementById('search-results');
        personDetail = document.getElementById('person-detail');
        loadingState = document.getElementById('loading-state');
        personAvatar = document.getElementById('person-avatar');
        personName = document.getElementById('person-name');
        personIdBadge = document.getElementById('person-id-badge');
        personCurrentRole = document.getElementById('person-current-role');
        careerPath = document.getElementById('career-path');
        eventsTimeline = document.getElementById('events-timeline');
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
            if (currentPersonId) {
                Nav.goTo('pages/connections.html', { type: 'person', id: currentPersonId });
            }
        });
    }

    /**
     * Check URL params for direct person loading
     */
    function checkUrlParams() {
        const personId = Nav.getParam('person_id');
        if (personId) {
            loadPersonJourney(personId);
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
            const data = await API.get(`people.php?action=search&q=${encodeURIComponent(query)}`);
            if (data.success && data.results.length > 0) {
                renderSearchResults(data.results);
                showDropdown();
            } else {
                renderNoResults();
                showDropdown();
            }
        } catch (error) {
            console.error('Search failed:', error);
            Toast.error('Failed to search people. Please try again.');
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
        searchDropdown.innerHTML = results.map(person => `
            <div class="search-dropdown-item" 
                 role="option" 
                 tabindex="0"
                 data-person-id="${escapeHtml(person.person_id)}"
                 aria-label="${escapeHtml(person.name)} - ${escapeHtml(person.current_role || 'No current role')}">
                <div>
                    <div class="item-title">${escapeHtml(person.name)}</div>
                    <div class="item-meta">${escapeHtml(person.person_id)}</div>
                </div>
                <div class="item-role">
                    ${person.current_role ? escapeHtml(person.current_role) : '<em>No active role</em>'}
                    ${person.current_department ? `<br><small>${escapeHtml(person.current_department)}</small>` : ''}
                </div>
            </div>
        `).join('');

        // Bind click events to results
        searchDropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const personId = item.dataset.personId;
                searchInput.value = item.querySelector('.item-title').textContent;
                hideDropdown();
                loadPersonJourney(personId);
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
                <span class="text-muted">No people found matching your search.</span>
            </div>
        `;
    }

    /**
     * Load person journey data from API
     */
    async function loadPersonJourney(personId) {
        currentPersonId = personId;
        showLoading();
        hideDetail();

        try {
            const data = await API.get(`people.php?action=journey&person_id=${encodeURIComponent(personId)}`);
            if (data.success) {
                renderPersonHeader(data.person, data.current_role);
                renderCareerPath(data.assignments);
                renderTimeline(data.events);
                showDetail();
            } else {
                Toast.error('Person not found.');
            }
        } catch (error) {
            console.error('Failed to load person journey:', error);
            Toast.error('Failed to load person journey. Please try again.');
        } finally {
            hideLoading();
        }
    }

    /**
     * Render the person header card
     */
    function renderPersonHeader(person, currentRole) {
        // Avatar initials
        const initials = person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        personAvatar.textContent = initials;

        personName.textContent = person.name;
        personIdBadge.textContent = person.person_id;

        // Current role display
        if (currentRole) {
            personCurrentRole.innerHTML = `
                Currently: <span class="role-link" onclick="Nav.goToRoleHistory('${escapeHtml(currentRole.role_id)}')">${escapeHtml(currentRole.title)}</span>
                ${currentRole.department ? `<span class="department-tag">${escapeHtml(currentRole.department)}</span>` : ''}
                <br><small class="text-muted">Since ${formatDate(currentRole.start_date)}</small>
            `;
        } else {
            personCurrentRole.innerHTML = '<span class="text-muted">No active role assignment</span>';
        }
    }

    /**
     * Render the career path (role assignments)
     */
    function renderCareerPath(assignments) {
        if (!assignments || assignments.length === 0) {
            careerPath.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No role assignments found.</p>
                </div>
            `;
            return;
        }

        // Reverse to show most recent first
        const sorted = [...assignments].reverse();

        careerPath.innerHTML = sorted.map(assignment => {
            const isCurrent = !assignment.end_date;
            const dateRange = `${formatDate(assignment.start_date)} — ${assignment.end_date ? formatDate(assignment.end_date) : 'Present'}`;

            return `
                <div class="career-item ${isCurrent ? 'current' : ''}" 
                     onclick="Nav.goToRoleHistory('${escapeHtml(assignment.role_id)}')"
                     role="button"
                     tabindex="0"
                     aria-label="View role history for ${escapeHtml(assignment.title)}">
                    <div class="career-item-header">
                        <span class="career-item-title">${escapeHtml(assignment.title)}</span>
                        ${isCurrent ? '<span class="career-item-badge">Current</span>' : ''}
                    </div>
                    <div class="career-item-meta">${dateRange}</div>
                    ${assignment.department ? `<div class="career-item-department">${escapeHtml(assignment.department)}</div>` : ''}
                </div>
            `;
        }).join('');

        // Keyboard support
        careerPath.querySelectorAll('.career-item').forEach(item => {
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') item.click();
            });
        });
    }

    /**
     * Render the events timeline
     */
    function renderTimeline(events) {
        if (!events || events.length === 0) {
            eventsTimeline.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No transition events recorded for this person.</p>
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

    // UI helpers
    function showDropdown() { searchDropdown.classList.remove('hidden'); }
    function hideDropdown() { searchDropdown.classList.add('hidden'); }
    function showDetail() { personDetail.classList.remove('hidden'); }
    function hideDetail() { personDetail.classList.add('hidden'); }
    function showLoading() { loadingState.classList.remove('hidden'); }
    function hideLoading() { loadingState.classList.add('hidden'); }

    /**
     * Public method to load a person (for external navigation)
     */
    function loadPerson(personId) {
        searchInput.value = '';
        loadPersonJourney(personId);
    }

    return { init, loadPerson, loadPersonJourney };
})();

// Initialise when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    PersonJourney.init();
});
