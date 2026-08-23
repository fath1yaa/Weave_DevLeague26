/**
 * Connection View - Weave Application
 * 
 * Provides navigation links between role history and person journey views.
 * Detects and displays temporally correlated events.
 * Preserves temporal context during navigation.
 */

'use strict';

const ConnectionView = (() => {
    /**
     * Initialise the connection view
     * Can be used standalone on a connections page or embedded in other views
     */
    function init() {
        const type = Nav.getParam('type');
        const id = Nav.getParam('id');

        if (type && id) {
            loadConnections(type, id);
        }
    }

    /**
     * Load connections data from API
     * @param {string} type - 'role' or 'person'
     * @param {string} id - entity ID
     */
    async function loadConnections(type, id) {
        const container = document.getElementById('connections-container');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-overlay">
                <div class="spinner"></div>
                <span>Loading connections...</span>
            </div>
        `;

        try {
            const data = await API.get(`connections.js?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
            if (data.success) {
                renderConnections(container, data);
            } else {
                container.innerHTML = '<div class="empty-state"><p>No connections found.</p></div>';
            }
        } catch (error) {
            console.error('Failed to load connections:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load connections. Please try again.</p></div>';
            Toast.error('Failed to load connections.');
        }
    }

    /**
     * Render connections data
     */
    function renderConnections(container, data) {
        let html = '';

        if (data.entity_type === 'role') {
            html = renderRoleConnections(data);
        } else {
            html = renderPersonConnections(data);
        }

        container.innerHTML = html;
        bindConnectionEvents(container);
    }

    /**
     * Render connections for a role
     */
    function renderRoleConnections(data) {
        let html = '';

        // Entity header
        html += `
            <div class="connection-header">
                <h3>Connections for Role: ${escapeHtml(data.entity.title)}</h3>
                <p class="text-muted">${escapeHtml(data.entity.department || 'No department')}</p>
            </div>
        `;

        // Connected people
        if (data.connected_people && data.connected_people.length > 0) {
            html += `
                <div class="connection-section">
                    <h4 class="connection-section-title">People who held this role</h4>
                    <div class="connection-list">
                        ${data.connected_people.map(person => `
                            <div class="connection-item" 
                                 data-nav="person-journey" 
                                 data-id="${escapeHtml(person.person_id)}"
                                 role="button" tabindex="0">
                                <div class="connection-item-icon person-icon" aria-hidden="true">
                                    ${person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                                <div class="connection-item-content">
                                    <div class="connection-item-name">${escapeHtml(person.name)}</div>
                                    <div class="connection-item-meta">
                                        ${formatDate(person.start_date)} — ${person.end_date ? formatDate(person.end_date) : 'Present'}
                                    </div>
                                </div>
                                ${!person.end_date ? '<span class="badge badge-success">Current</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Related roles (same department)
        if (data.related_roles && data.related_roles.length > 0) {
            html += `
                <div class="connection-section">
                    <h4 class="connection-section-title">Related roles in ${escapeHtml(data.entity.department)}</h4>
                    <div class="connection-list">
                        ${data.related_roles.map(role => `
                            <div class="connection-item" 
                                 data-nav="role-history" 
                                 data-id="${escapeHtml(role.role_id)}"
                                 role="button" tabindex="0">
                                <div class="connection-item-icon role-icon" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                                        <path d="M16 7V5a4 4 0 0 0-8 0v2"/>
                                    </svg>
                                </div>
                                <div class="connection-item-content">
                                    <div class="connection-item-name">${escapeHtml(role.title)}</div>
                                    <div class="connection-item-meta">${escapeHtml(role.role_id)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Correlated events
        html += renderCorrelatedEvents(data.correlated_events);

        return html;
    }

    /**
     * Render connections for a person
     */
    function renderPersonConnections(data) {
        let html = '';

        // Entity header
        html += `
            <div class="connection-header">
                <h3>Connections for: ${escapeHtml(data.entity.name)}</h3>
                <p class="text-muted">${escapeHtml(data.entity.person_id)}</p>
            </div>
        `;

        // Connected roles
        if (data.connected_roles && data.connected_roles.length > 0) {
            html += `
                <div class="connection-section">
                    <h4 class="connection-section-title">Roles held</h4>
                    <div class="connection-list">
                        ${data.connected_roles.map(role => `
                            <div class="connection-item" 
                                 data-nav="role-history" 
                                 data-id="${escapeHtml(role.role_id)}"
                                 role="button" tabindex="0">
                                <div class="connection-item-icon role-icon" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                                        <path d="M16 7V5a4 4 0 0 0-8 0v2"/>
                                    </svg>
                                </div>
                                <div class="connection-item-content">
                                    <div class="connection-item-name">${escapeHtml(role.title)}</div>
                                    <div class="connection-item-meta">
                                        ${formatDate(role.start_date)} — ${role.end_date ? formatDate(role.end_date) : 'Present'}
                                        ${role.department ? ` &middot; ${escapeHtml(role.department)}` : ''}
                                    </div>
                                </div>
                                ${!role.end_date ? '<span class="badge badge-success">Current</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Related people (via shared roles)
        if (data.related_people && data.related_people.length > 0) {
            html += `
                <div class="connection-section">
                    <h4 class="connection-section-title">People connected via shared roles</h4>
                    ${data.related_people.map(group => `
                        <div class="connection-group">
                            <div class="connection-group-label">Via: ${escapeHtml(group.via_role)}</div>
                            <div class="connection-list">
                                ${group.people.map(person => `
                                    <div class="connection-item" 
                                         data-nav="person-journey" 
                                         data-id="${escapeHtml(person.person_id)}"
                                         role="button" tabindex="0">
                                        <div class="connection-item-icon person-icon" aria-hidden="true">
                                            ${person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div class="connection-item-content">
                                            <div class="connection-item-name">${escapeHtml(person.name)}</div>
                                            <div class="connection-item-meta">
                                                ${formatDate(person.start_date)} — ${person.end_date ? formatDate(person.end_date) : 'Present'}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Correlated events
        html += renderCorrelatedEvents(data.correlated_events);

        return html;
    }

    /**
     * Render temporally correlated events section
     */
    function renderCorrelatedEvents(correlatedEvents) {
        if (!correlatedEvents || correlatedEvents.length === 0) {
            return '';
        }

        let html = `
            <div class="connection-section">
                <h4 class="connection-section-title">
                    Temporally Correlated Events
                    <span class="badge badge-warning">Within 30 days</span>
                </h4>
        `;

        correlatedEvents.forEach(group => {
            const sourceEvent = group.source_event;
            const sourceTypeLabel = sourceEvent.event_type.replace(/_/g, ' ');

            html += `
                <div class="correlation-group">
                    <div class="correlation-source">
                        <span class="correlation-date">${formatDate(sourceEvent.effective_date)}</span>
                        <span class="correlation-type">${escapeHtml(sourceTypeLabel)}</span>
                        ${sourceEvent.description ? `<span class="correlation-desc"> — ${escapeHtml(sourceEvent.description)}</span>` : ''}
                    </div>
                    <div class="correlation-list">
                        ${group.correlated.map(evt => {
                            const evtTypeLabel = evt.event_type.replace(/_/g, ' ');
                            const navType = evt.entity_type === 'role' ? 'role-history' : 'person-journey';
                            const navParam = evt.entity_type === 'role' ? 'role_id' : 'person_id';
                            return `
                                <div class="correlation-item" 
                                     data-nav="${navType}" 
                                     data-id="${escapeHtml(evt.entity_id)}"
                                     data-date="${escapeHtml(evt.effective_date)}"
                                     role="button" tabindex="0">
                                    <div class="correlation-item-badge ${evt.entity_type}" aria-hidden="true">
                                        ${evt.entity_type === 'role' ? 'R' : 'P'}
                                    </div>
                                    <div class="correlation-item-content">
                                        <div class="correlation-item-name">
                                            ${escapeHtml(evt.entity_name || evt.entity_id)}
                                        </div>
                                        <div class="correlation-item-detail">
                                            ${escapeHtml(evtTypeLabel)} on ${formatDate(evt.effective_date)}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    /**
     * Bind click events for navigation on connection items
     */
    function bindConnectionEvents(container) {
        container.querySelectorAll('[data-nav]').forEach(item => {
            const handler = () => {
                const nav = item.dataset.nav;
                const id = item.dataset.id;
                const date = item.dataset.date || Nav.getParam('date');

                if (nav === 'role-history') {
                    Nav.goToRoleHistory(id, date);
                } else if (nav === 'person-journey') {
                    Nav.goToPersonJourney(id, date);
                }
            };

            item.addEventListener('click', handler);
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handler();
            });
        });
    }

    return { init, loadConnections };
})();

// Initialise when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ConnectionView.init();
});
