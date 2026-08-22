/**
 * Weave - Org Chart Renderer
 *
 * A reusable component that renders the organisational structure as a
 * hierarchical tree (flexbox-based HTML/CSS layout) for a given point in time.
 *
 * Responsibilities:
 * - Accept org-state data (a nested tree of nodes) or a date to fetch state for
 * - Render each node's role title, occupant (or "Vacant"), department and
 *   reporting line (parent role)  (Req 5.5, Property 10)
 * - Animate transitions when the date changes: nodes appearing, disappearing,
 *   and repositioning, honouring prefers-reduced-motion  (Req 5.4)
 * - Navigate to the role-history or person-journey views on node click,
 *   preserving the current date as temporal context  (Req 5.6)
 * - Render the empty state when there is no data for the selected date
 *
 * Usage:
 *   const chart = new OrgChart(document.getElementById('orgchart'));
 *   chart.render(orgStateData);          // data from GET /api/orgchart.php
 *   // or, to fetch by date:
 *   await chart.update('2023-06-01');    // fetches then renders (Req 5.2)
 *
 * The org chart API (GET /api/orgchart.php?date=YYYY-MM-DD) returns nodes
 * already assembled into a hierarchical tree: each node has a nested `children`
 * array and roots are the top-level entries of `nodes`. The empty-state
 * response has `nodes: []` and a `message`.
 *
 * Depends on app.js (EventBus, Nav, API, formatDate) being loaded first. All
 * app.js usage is feature-detected so the component still works standalone.
 */

'use strict';

class OrgChart {
    /**
     * @param {HTMLElement} container - Element the chart renders into
     * @param {Object} [options]
     * @param {string} [options.apiEndpoint='orgchart.php'] - Endpoint used to
     *        fetch org state by date
     * @param {boolean} [options.animate=true] - Whether to animate transitions
     */
    constructor(container, options = {}) {
        if (!container || container.nodeType !== 1) {
            throw new Error('OrgChart requires a container element');
        }

        this.element = container;
        this.options = options;
        this.apiEndpoint = options.apiEndpoint || 'orgchart.php';
        this.animate = options.animate !== false;

        // The currently selected date (YYYY-MM-DD), preserved for navigation.
        this.currentDate = null;
        // Snapshot of role_ids rendered in the previous state, for diffing.
        this._prevRoleIds = new Set();

        this.element.classList.add('orgchart');

        // Bound handler so the same reference is added/removed cleanly.
        this._onNodeClick = this._onNodeClick.bind(this);
        this.element.addEventListener('click', this._onNodeClick);
    }

    // ----------------------------------------
    // Public API
    // ----------------------------------------

    /**
     * Fetch org state for a date and render it. Exposed so page wiring can call
     * this in response to the timeline `datechange` event (task 4.6).
     * @param {string} date - YYYY-MM-DD
     * @returns {Promise<void>}
     */
    async update(date) {
        this.element.classList.add('is-loading');
        try {
            const data = await this._fetchState(date);
            this.render(data);
        } catch (error) {
            console.error('[OrgChart] Failed to fetch org state:', error);
            if (typeof Toast !== 'undefined' && Toast.error) {
                Toast.error('Could not load the org chart for ' + date);
            }
            this._renderMessage('Could not load the org chart.');
        } finally {
            this.element.classList.remove('is-loading');
        }
    }

    /**
     * Render a given org-state payload. Accepts the full API response shape
     * ({ date, date_range, nodes, message }) or a bare array of root nodes.
     * @param {Object|Array} data
     */
    render(data) {
        const state = this._normalise(data);
        this.currentDate = state.date || this.currentDate;

        if (!state.nodes || state.nodes.length === 0) {
            this._prevRoleIds = new Set();
            this._renderMessage(state.message || 'No data for selected date');
            return;
        }

        const nextRoleIds = new Set();
        this._collectRoleIds(state.nodes, nextRoleIds);

        // Build the fresh tree off-DOM.
        const canvas = document.createElement('div');
        canvas.className = 'orgchart-canvas';

        const roots = document.createElement('ul');
        roots.className = 'orgchart-tree orgchart-roots';
        state.nodes.forEach(node => {
            roots.appendChild(this._buildNode(node, true, nextRoleIds));
        });
        canvas.appendChild(roots);

        this._swapCanvas(canvas, nextRoleIds);
        this._prevRoleIds = nextRoleIds;

        if (typeof EventBus !== 'undefined' && EventBus.emit) {
            EventBus.emit('orgchart:rendered', {
                date: this.currentDate,
                nodeCount: nextRoleIds.size
            });
        }
    }

    /** Get the date currently displayed. @returns {string|null} */
    getDate() {
        return this.currentDate;
    }

    /** Tear down event listeners. */
    destroy() {
        this.element.removeEventListener('click', this._onNodeClick);
    }

    // ----------------------------------------
    // Rendering
    // ----------------------------------------

    /**
     * Build a single node (and its subtree) as an <li> tree element.
     * @param {Object} node - Node with title/occupant/reports_to/children
     * @param {boolean} isRoot - Whether this node is a top-level root
     * @param {Set<string>} nextRoleIds - Accumulated ids for enter-animation diff
     * @returns {HTMLLIElement}
     */
    _buildNode(node, isRoot, nextRoleIds) {
        const children = Array.isArray(node.children) ? node.children : [];
        const hasChildren = children.length > 0;

        const li = document.createElement('li');
        li.className = 'orgchart-node';
        if (isRoot) li.classList.add('is-root');
        if (hasChildren) li.classList.add('has-children');
        if (node.role_id != null) li.dataset.roleId = String(node.role_id);

        // Nodes that were not present in the previous render animate in.
        const roleId = node.role_id != null ? String(node.role_id) : null;
        if (this.animate && roleId !== null && !this._prevRoleIds.has(roleId)) {
            li.classList.add('is-entering');
        }

        li.appendChild(this._buildCard(node));

        if (hasChildren) {
            const ul = document.createElement('ul');
            ul.className = 'orgchart-tree';
            children.forEach(child => {
                ul.appendChild(this._buildNode(child, false, nextRoleIds));
            });
            li.appendChild(ul);
        }

        return li;
    }

    /**
     * Build the card that shows a node's details. Role title links to role
     * history; occupant name links to the person journey (Req 5.5, 5.6).
     * @param {Object} node
     * @returns {HTMLDivElement}
     */
    _buildCard(node) {
        const card = document.createElement('div');
        card.className = 'orgchart-card';

        const occupantName = this._occupantName(node);
        const isVacant = occupantName === 'Vacant';
        if (isVacant) card.classList.add('is-vacant');

        // Role title -> role history view.
        const role = document.createElement('button');
        role.type = 'button';
        role.className = 'orgchart-role';
        role.textContent = node.title != null ? String(node.title) : 'Untitled role';
        if (node.role_id != null) {
            role.dataset.action = 'role';
            role.dataset.roleId = String(node.role_id);
            role.setAttribute(
                'aria-label',
                'View role history for ' + role.textContent
            );
        }
        card.appendChild(role);

        // Occupant name -> person journey view (or a static "Vacant" label).
        if (isVacant || node.person_id == null) {
            const vacant = document.createElement('span');
            vacant.className = 'orgchart-occupant is-vacant';
            vacant.textContent = occupantName;
            card.appendChild(vacant);
        } else {
            const occupant = document.createElement('button');
            occupant.type = 'button';
            occupant.className = 'orgchart-occupant is-linked';
            occupant.textContent = occupantName;
            occupant.dataset.action = 'person';
            occupant.dataset.personId = String(node.person_id);
            occupant.setAttribute(
                'aria-label',
                'View journey for ' + occupantName
            );
            card.appendChild(occupant);
        }

        // Department badge (optional).
        if (node.department != null && String(node.department).length > 0) {
            const dept = document.createElement('span');
            dept.className = 'orgchart-department';
            dept.textContent = String(node.department);
            card.appendChild(dept);
        }

        // Reporting line (parent role) - part of node completeness (Property 10).
        const reports = document.createElement('span');
        reports.className = 'orgchart-reports-to';
        reports.textContent = node.reports_to != null && String(node.reports_to).length > 0
            ? 'Reports to: ' + String(node.reports_to)
            : 'Reports to: \u2014';
        card.appendChild(reports);

        return card;
    }

    /**
     * Swap the freshly built canvas into the DOM, animating exits of nodes that
     * are no longer present and repositioning of nodes that persist (Req 5.4).
     * @param {HTMLElement} nextCanvas
     * @param {Set<string>} nextRoleIds
     */
    _swapCanvas(nextCanvas, nextRoleIds) {
        const prevCanvas = this.element.querySelector('.orgchart-canvas');

        if (!this.animate || !prevCanvas || this._prefersReducedMotion()) {
            this.element.innerHTML = '';
            this.element.appendChild(nextCanvas);
            return;
        }

        // Animate out any nodes that existed before but are gone now.
        const exiting = [];
        prevCanvas.querySelectorAll('.orgchart-node').forEach(li => {
            const id = li.dataset.roleId;
            if (id && !nextRoleIds.has(id)) {
                li.classList.add('is-exiting');
                exiting.push(li);
            }
        });

        // Enable a repositioning transition on the incoming canvas.
        nextCanvas.classList.add('is-repositioning');

        const commit = () => {
            this.element.innerHTML = '';
            this.element.appendChild(nextCanvas);
        };

        if (exiting.length > 0) {
            // Give the exit animation time to play, then commit the new tree.
            window.setTimeout(commit, 250);
        } else {
            commit();
        }
    }

    /**
     * Render a full-width message (empty or error state).
     * @param {string} message
     */
    _renderMessage(message) {
        this.element.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'orgchart-message';
        el.setAttribute('role', 'status');
        el.textContent = message;
        this.element.appendChild(el);
    }

    // ----------------------------------------
    // Interaction
    // ----------------------------------------

    /**
     * Delegated click handler for node role/occupant affordances (Req 5.6).
     * Preserves temporal context by passing the current date.
     * @param {MouseEvent} e
     */
    _onNodeClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target || !this.element.contains(target)) return;

        const action = target.dataset.action;
        if (action === 'role') {
            this._goToRoleHistory(target.dataset.roleId);
        } else if (action === 'person') {
            this._goToPersonJourney(target.dataset.personId);
        }
    }

    /**
     * Navigate to the role history view, preserving the current date.
     * @param {string} roleId
     */
    _goToRoleHistory(roleId) {
        if (!roleId) return;
        if (typeof Nav !== 'undefined' && Nav.goToRoleHistory) {
            Nav.goToRoleHistory(roleId, this.currentDate);
            return;
        }
        this._fallbackNavigate('role-history.html', { role_id: roleId });
    }

    /**
     * Navigate to the person journey view, preserving the current date.
     * @param {string} personId
     */
    _goToPersonJourney(personId) {
        if (!personId) return;
        if (typeof Nav !== 'undefined' && Nav.goToPersonJourney) {
            Nav.goToPersonJourney(personId, this.currentDate);
            return;
        }
        this._fallbackNavigate('person-journey.html', { person_id: personId });
    }

    /**
     * Standalone navigation fallback when app.js Nav is unavailable.
     * @param {string} page
     * @param {Object} params
     */
    _fallbackNavigate(page, params) {
        const merged = Object.assign({}, params);
        if (this.currentDate) merged.date = this.currentDate;
        const query = new URLSearchParams(merged).toString();
        window.location.href = page + (query ? '?' + query : '');
    }

    // ----------------------------------------
    // Data helpers
    // ----------------------------------------

    /**
     * Fetch org state for a date from the API.
     * @param {string} date - YYYY-MM-DD
     * @returns {Promise<Object>}
     */
    async _fetchState(date) {
        const endpoint = this.apiEndpoint + (date ? '?date=' + encodeURIComponent(date) : '');
        if (typeof API !== 'undefined' && typeof API.get === 'function') {
            return API.get(endpoint);
        }
        const response = await fetch('../api/' + endpoint);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    }

    /**
     * Normalise the various accepted input shapes into { date, nodes, message }.
     * @param {Object|Array} data
     * @returns {{date: (string|null), nodes: Array, message: (string|null)}}
     */
    _normalise(data) {
        if (Array.isArray(data)) {
            return { date: null, nodes: data, message: null };
        }
        if (data && typeof data === 'object') {
            return {
                date: data.date != null ? data.date : null,
                nodes: Array.isArray(data.nodes) ? data.nodes : [],
                message: data.message != null ? data.message : null
            };
        }
        return { date: null, nodes: [], message: null };
    }

    /**
     * Resolve the occupant display name for a node, defaulting to "Vacant".
     * @param {Object} node
     * @returns {string}
     */
    _occupantName(node) {
        const raw = node.occupant;
        if (raw == null || String(raw).trim().length === 0) return 'Vacant';
        return String(raw);
    }

    /**
     * Recursively collect all role_ids from a node tree into a set.
     * @param {Array} nodes
     * @param {Set<string>} into
     */
    _collectRoleIds(nodes, into) {
        nodes.forEach(node => {
            if (node.role_id != null) into.add(String(node.role_id));
            if (Array.isArray(node.children) && node.children.length > 0) {
                this._collectRoleIds(node.children, into);
            }
        });
    }

    /**
     * Whether the user prefers reduced motion.
     * @returns {boolean}
     */
    _prefersReducedMotion() {
        return typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
}

// Expose globally for non-module usage (matches app.js / timeline-slider.js style).
if (typeof window !== 'undefined') {
    window.OrgChart = OrgChart;
}
