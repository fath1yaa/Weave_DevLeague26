/**
 * Weave - Org Chart Renderer Module
 * 
 * Renders hierarchical org structure as an interactive tree.
 * Listens for date-change events from the timeline slider,
 * fetches state from the API, and renders animated nodes.
 * 
 * Dependencies: app.js (EventBus, API, Nav, escapeHtml), timeline-slider.js
 */

'use strict';

const OrgChart = (() => {
    // State
    let container = null;
    let currentNodes = [];
    let isLoading = false;
    let lastDate = null;

    // Department colour map
    const DEPT_COLOURS = {
        'engineering': 'dept-engineering',
        'product': 'dept-product',
        'design': 'dept-design',
        'marketing': 'dept-marketing',
        'sales': 'dept-sales',
        'finance': 'dept-finance',
        'hr': 'dept-hr',
        'human resources': 'dept-hr',
        'operations': 'dept-operations',
        'executive': 'dept-executive',
        'leadership': 'dept-executive'
    };

    /**
     * Initialize the org chart renderer
     */
    function init() {
        container = document.getElementById('orgchart-content');
        if (!container) {
            console.warn('[OrgChart] Container #orgchart-content not found');
            return;
        }

        // Listen for date changes from timeline
        EventBus.on('timeline:datechange', handleDateChange);

        // Listen for app ready
        EventBus.on('app:ready', () => {
            // If timeline didn't init (no data), show empty state
            setTimeout(() => {
                if (!lastDate) {
                    showEmptyState();
                }
            }, 2000);
        });
    }

    /**
     * Handle date change event from timeline slider
     */
    async function handleDateChange(data) {
        if (!data || !data.date) return;
        if (data.date === lastDate) return; // Skip if same date

        lastDate = data.date;
        await loadOrgState(data.date);
    }

    /**
     * Load org state from API for a given date
     */
    async function loadOrgState(date) {
        if (isLoading) return;
        isLoading = true;

        showLoading();

        try {
            const data = await API.get(`orgchart.php?date=${encodeURIComponent(date)}`);

            if (data.success) {
                currentNodes = data.nodes || [];

                if (currentNodes.length === 0) {
                    showEmptyState();
                } else {
                    renderTree(currentNodes);
                }

                // Update timeline stats
                const vacantCount = currentNodes.filter(n => !n.occupant).length;
                if (typeof TimelineSlider !== 'undefined') {
                    TimelineSlider.updateStats(currentNodes.length, vacantCount);
                }
            } else {
                showEmptyState();
            }
        } catch (error) {
            console.error('[OrgChart] Failed to load org state:', error);
            if (error.status === 400) {
                showEmptyState('Invalid date selected');
            } else {
                showErrorState();
            }
        } finally {
            isLoading = false;
        }
    }

    /**
     * Render the hierarchical tree from flat node list
     */
    function renderTree(nodes) {
        if (!container) return;

        // Build a tree structure from flat node list
        const tree = buildHierarchy(nodes);

        // Render as nested UL/LI
        let html = '<div class="org-tree" role="tree" aria-label="Organisation chart">';
        html += renderLevel(tree);
        html += '</div>';

        container.innerHTML = html;

        // Bind click handlers
        bindNodeClicks();
    }

    /**
     * Build hierarchy from flat node array using reports_to
     */
    function buildHierarchy(nodes) {
        const nodeMap = {};
        const roots = [];

        // Index all nodes by role_id
        nodes.forEach(node => {
            nodeMap[node.role_id] = { ...node, children: [] };
        });

        // Link children to parents
        nodes.forEach(node => {
            if (node.reports_to && nodeMap[node.reports_to]) {
                nodeMap[node.reports_to].children.push(nodeMap[node.role_id]);
            } else {
                // No parent found or no reports_to — treat as root
                roots.push(nodeMap[node.role_id]);
            }
        });

        return roots;
    }

    /**
     * Render a level of the tree as UL > LI elements
     */
    function renderLevel(nodes) {
        if (!nodes || nodes.length === 0) return '';

        let html = '<ul>';
        nodes.forEach(node => {
            const isRoot = !node.reports_to;
            html += `<li>`;
            html += renderNode(node, isRoot);
            if (node.children && node.children.length > 0) {
                html += renderLevel(node.children);
            }
            html += `</li>`;
        });
        html += '</ul>';

        return html;
    }

    /**
     * Render a single node card
     */
    function renderNode(node, isRoot) {
        const deptClass = getDeptClass(node.department);
        const rootClass = isRoot ? ' root-node' : '';
        const personClass = node.occupant ? '' : ' vacant';
        const personName = node.occupant ? escapeHtml(node.occupant) : 'Vacant';
        const title = escapeHtml(node.title || 'Untitled Role');
        const dept = escapeHtml(node.department || 'General');

        return `
            <div class="org-node${rootClass}" 
                 data-role-id="${escapeHtml(node.role_id)}"
                 data-person-id="${node.person_id ? escapeHtml(node.person_id) : ''}"
                 role="treeitem"
                 tabindex="0"
                 aria-label="${title}, occupied by ${personName}, ${dept} department">
                <div class="org-node-title" title="${title}">${title}</div>
                <div class="org-node-person${personClass}">
                    ${personName}
                </div>
                <span class="org-node-department ${deptClass}">${dept}</span>
            </div>
        `;
    }

    /**
     * Get department CSS class from department name
     */
    function getDeptClass(department) {
        if (!department) return 'dept-default';
        const key = department.toLowerCase().trim();
        return DEPT_COLOURS[key] || 'dept-default';
    }

    /**
     * Bind click handlers to all node elements
     */
    function bindNodeClicks() {
        const nodes = container.querySelectorAll('.org-node');
        nodes.forEach(node => {
            node.addEventListener('click', handleNodeClick);
            node.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(e);
                }
            });
        });
    }

    /**
     * Handle click on a node - navigate to role or person detail
     */
    function handleNodeClick(e) {
        const nodeEl = e.currentTarget;
        const roleId = nodeEl.dataset.roleId;
        const personId = nodeEl.dataset.personId;

        // Highlight the clicked node briefly
        nodeEl.classList.add('highlight');
        setTimeout(() => nodeEl.classList.remove('highlight'), 600);

        // If there's a person, go to person journey; otherwise role history
        if (personId) {
            Nav.goToPersonJourney(personId, lastDate);
        } else {
            Nav.goToRoleHistory(roleId, lastDate);
        }
    }

    /**
     * Show loading state
     */
    function showLoading() {
        if (!container) return;
        container.innerHTML = `
            <div class="orgchart-loading">
                <div class="spinner"></div>
                <span class="orgchart-loading-text">Loading organisation structure...</span>
            </div>
        `;
    }

    /**
     * Show empty state (no data)
     */
    function showEmptyState(message) {
        if (!container) return;
        container.innerHTML = `
            <div class="orgchart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="4" rx="1"/>
                    <rect x="2" y="14" width="6" height="4" rx="1"/>
                    <rect x="16" y="14" width="6" height="4" rx="1"/>
                    <line x1="12" y1="6" x2="12" y2="10"/>
                    <line x1="5" y1="14" x2="5" y2="10"/>
                    <line x1="19" y1="14" x2="19" y2="10"/>
                    <line x1="5" y1="10" x2="19" y2="10"/>
                </svg>
                <h3>${message || 'No organisation data available'}</h3>
                <p>Upload CSV files containing roles, people, and events to visualise the org structure over time.</p>
                <a href="upload.html" class="btn btn-primary">Upload CSV Data</a>
            </div>
        `;
    }

    /**
     * Show error state
     */
    function showErrorState() {
        if (!container) return;
        container.innerHTML = `
            <div class="orgchart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <circle cx="12" cy="16" r="0.5" fill="currentColor"/>
                </svg>
                <h3>Unable to load organisation data</h3>
                <p>Please check that the database is running and try again.</p>
            </div>
        `;
    }

    // Public API
    return {
        init,
        loadOrgState,
        getNodes: () => currentNodes
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('orgchart-content')) {
        OrgChart.init();
    }
});
