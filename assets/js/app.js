/**
 * Weave - Main Application Bootstrap
 * 
 * Provides:
 * - EventBus: Publish/subscribe system for inter-component communication
 * - Navigation: Helper functions for page navigation with context
 * - Toast: Notification system for user feedback
 * - API: Fetch wrapper for backend communication
 */

'use strict';

// ============================================
// Event Bus - Publish/Subscribe Pattern
// ============================================

const EventBus = (() => {
    const listeners = {};

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    function on(event, callback) {
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(callback);

        // Return unsubscribe function
        return () => off(event, callback);
    }

    /**
     * Subscribe to an event once (auto-removes after first fire)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    function once(event, callback) {
        const wrapper = (...args) => {
            off(event, wrapper);
            callback(...args);
        };
        on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler to remove
     */
    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event with optional data
     * @param {string} event - Event name
     * @param {*} data - Event payload
     */
    function emit(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in handler for "${event}":`, error);
            }
        });
    }

    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Specific event, or omit to clear all
     */
    function clear(event) {
        if (event) {
            delete listeners[event];
        } else {
            Object.keys(listeners).forEach(key => delete listeners[key]);
        }
    }

    return { on, once, off, emit, clear };
})();


// ============================================
// Navigation Helpers
// ============================================

const Nav = (() => {
    /**
     * Get the base path for the application (handles subdirectory deployments)
     * @returns {string}
     */
    function getBasePath() {
        const path = window.location.pathname;
        // If we're in a subdirectory page, go up one level
        if (path.includes('/pages/')) {
            return path.substring(0, path.lastIndexOf('/pages/')) + '/';
        }
        // If we're at root index
        const lastSlash = path.lastIndexOf('/');
        return path.substring(0, lastSlash + 1);
    }

    /**
     * Navigate to a page with optional query parameters
     * @param {string} page - Page path relative to project root (e.g., 'pages/orgchart.html')
     * @param {Object} [params] - Query parameters to include
     */
    function goTo(page, params) {
        let url = getBasePath() + page;
        if (params && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            url += '?' + query;
        }
        window.location.href = url;
    }

    /**
     * Navigate to role history page for a specific role
     * @param {string} roleId - The role ID to view
     * @param {string} [date] - Optional date context to preserve
     */
    function goToRoleHistory(roleId, date) {
        const params = { role_id: roleId };
        if (date) params.date = date;
        goTo('pages/role-history.html', params);
    }

    /**
     * Navigate to person journey page for a specific person
     * @param {string} personId - The person ID to view
     * @param {string} [date] - Optional date context to preserve
     */
    function goToPersonJourney(personId, date) {
        const params = { person_id: personId };
        if (date) params.date = date;
        goTo('pages/person-journey.html', params);
    }

    /**
     * Navigate to org chart at a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     */
    function goToOrgChart(date) {
        const params = date ? { date } : {};
        goTo('pages/orgchart.html', params);
    }

    /**
     * Get a query parameter from the current URL
     * @param {string} name - Parameter name
     * @returns {string|null}
     */
    function getParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    /**
     * Get all query parameters as an object
     * @returns {Object}
     */
    function getParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        params.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * Set the active nav link based on current page
     */
    function setActiveNavLink() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.navbar-nav a');

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && currentPath.endsWith(href.replace('../', '').replace('./', ''))) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    return { getBasePath, goTo, goToRoleHistory, goToPersonJourney, goToOrgChart, getParam, getParams, setActiveNavLink };
})();


// ============================================
// Toast Notification System
// ============================================

const Toast = (() => {
    let container = null;

    function getContainer() {
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            container.setAttribute('role', 'alert');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {string} [type='info'] - Toast type: 'success', 'error', 'warning', 'info'
     * @param {number} [duration=4000] - Auto-dismiss time in ms (0 = manual dismiss)
     */
    function show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss notification">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => dismiss(toast));

        getContainer().appendChild(toast);

        if (duration > 0) {
            setTimeout(() => dismiss(toast), duration);
        }

        return toast;
    }

    function dismiss(toast) {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }

    function success(message, duration) { return show(message, 'success', duration); }
    function error(message, duration) { return show(message, 'error', duration); }
    function warning(message, duration) { return show(message, 'warning', duration); }
    function info(message, duration) { return show(message, 'info', duration); }

    return { show, success, error, warning, info };
})();


// ============================================
// API Fetch Wrapper
// ============================================

const API = (() => {
    /**
     * Get the API base URL
     * @returns {string}
     */
    function getBaseUrl() {
        const basePath = Nav.getBasePath();
        return basePath + 'api/';
    }

    /**
     * Make a GET request to an API endpoint
     * @param {string} endpoint - Endpoint path (e.g., 'roles.php?action=search&q=manager')
     * @returns {Promise<Object>}
     */
    async function get(endpoint) {
        const url = getBaseUrl() + endpoint;
        try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(response.status, errorData.message || response.statusText, errorData);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError(0, 'Network error: Unable to reach server', { original: error.message });
        }
    }

    /**
     * Make a POST request to an API endpoint
     * @param {string} endpoint - Endpoint path
     * @param {Object|FormData} data - Request body
     * @returns {Promise<Object>}
     */
    async function post(endpoint, data) {
        const url = getBaseUrl() + endpoint;
        const options = {
            method: 'POST',
            credentials: 'same-origin',
        };

        if (data instanceof FormData) {
            options.body = data;
        } else {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(response.status, errorData.message || response.statusText, errorData);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError(0, 'Network error: Unable to reach server', { original: error.message });
        }
    }

    /**
     * Make a PUT request to an API endpoint
     * @param {string} endpoint - Endpoint path
     * @param {Object} data - Request body
     * @returns {Promise<Object>}
     */
    async function put(endpoint, data) {
        const url = getBaseUrl() + endpoint;
        try {
            const response = await fetch(url, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(response.status, errorData.message || response.statusText, errorData);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError(0, 'Network error: Unable to reach server', { original: error.message });
        }
    }

    return { getBaseUrl, get, post, put };
})();

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(status, message, data = {}) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}


// ============================================
// Utility Functions
// ============================================

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - Raw string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Format a date string for display
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Present';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Debounce a function call
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}


// ============================================
// Scroll Animations (IntersectionObserver)
// ============================================

const ScrollAnimations = (() => {
    let observer = null;

    /**
     * Initialize scroll-triggered fade-in animations.
     * Elements with class 'fade-in-up' will animate into view
     * when they enter the viewport.
     */
    function init() {
        // Check for IntersectionObserver support
        if (!('IntersectionObserver' in window)) {
            // Fallback: just make everything visible immediately
            document.querySelectorAll('.fade-in-up').forEach(el => {
                el.classList.add('visible');
            });
            return;
        }

        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target); // Only animate once
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        document.querySelectorAll('.fade-in-up').forEach(el => {
            observer.observe(el);
        });
    }

    /**
     * Observe new elements added dynamically
     * @param {Element} el - Element to observe
     */
    function observe(el) {
        if (observer && el) {
            observer.observe(el);
        }
    }

    return { init, observe };
})();


// ============================================
// Navbar Scroll Effect
// ============================================

const NavbarScroll = (() => {
    function init() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;

        let ticking = false;

        function onScroll() {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    if (window.scrollY > 10) {
                        navbar.classList.add('scrolled');
                    } else {
                        navbar.classList.remove('scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        // Run once on load in case page is already scrolled
        onScroll();
    }

    return { init };
})();


// ============================================
// DOM Ready & Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Set active navigation link
    Nav.setActiveNavLink();

    // Set up mobile menu toggle
    const toggle = document.querySelector('.navbar-toggle');
    const nav = document.querySelector('.navbar-nav');
    if (toggle && nav) {
        toggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            const expanded = nav.classList.contains('open');
            toggle.setAttribute('aria-expanded', expanded);
        });
    }

    // Initialize scroll animations
    ScrollAnimations.init();

    // Initialize navbar scroll effect
    NavbarScroll.init();

    // Emit app ready event
    EventBus.emit('app:ready');
});
