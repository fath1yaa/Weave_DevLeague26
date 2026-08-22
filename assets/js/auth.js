/**
 * Authentication Module - Weave Application
 * 
 * Handles client-side auth state, login/logout API calls,
 * and toggling UI visibility based on authentication status.
 */

// eslint-disable-next-line no-unused-vars
const Auth = (() => {
    let currentUser = null;
    let isLoggedIn = false;
    let checkPromise = null;

    /**
     * Get the API base URL for auth endpoints.
     * Handles both root and /pages/ subdirectory.
     */
    function getAuthUrl(action) {
        const basePath = typeof Nav !== 'undefined' ? Nav.getBasePath() : '../';
        return basePath + 'api/auth.php?action=' + action;
    }

    /**
     * Check authentication status with the server.
     * @returns {Promise<boolean>}
     */
    async function check() {
        if (checkPromise) return checkPromise;

        checkPromise = (async () => {
            try {
                const response = await fetch(getAuthUrl('check'), {
                    credentials: 'same-origin'
                });
                if (!response.ok) {
                    isLoggedIn = false;
                    currentUser = null;
                    return false;
                }
                const data = await response.json();
                isLoggedIn = data.authenticated === true;
                currentUser = data.user || null;
                return isLoggedIn;
            } catch (e) {
                isLoggedIn = false;
                currentUser = null;
                return false;
            } finally {
                checkPromise = null;
            }
        })();

        return checkPromise;
    }

    /**
     * Login with username and password.
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{success: boolean, message: string, user: object|null}>}
     */
    async function login(username, password) {
        try {
            const response = await fetch(getAuthUrl('login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                isLoggedIn = true;
                currentUser = data.user;
                return { success: true, message: data.message, user: data.user };
            } else {
                isLoggedIn = false;
                currentUser = null;
                return { success: false, message: data.message || 'Login failed.' };
            }
        } catch (e) {
            return { success: false, message: 'Network error. Please try again.' };
        }
    }

    /**
     * Logout the current user.
     * @returns {Promise<boolean>}
     */
    async function logout() {
        try {
            const response = await fetch(getAuthUrl('logout'), {
                method: 'POST',
                credentials: 'same-origin'
            });
            isLoggedIn = false;
            currentUser = null;
            return response.ok;
        } catch (e) {
            isLoggedIn = false;
            currentUser = null;
            return false;
        }
    }

    /**
     * Get the current user data.
     * @returns {object|null}
     */
    function getUser() {
        return currentUser;
    }

    /**
     * Check if user is currently logged in (cached).
     * @returns {boolean}
     */
    function authenticated() {
        return isLoggedIn;
    }

    /**
     * Update the page UI based on auth state.
     * Shows/hides elements with data-auth-required and data-auth-hidden attributes.
     * Also updates the navbar auth button.
     */
    function updateUI() {
        // Elements only visible when logged in
        document.querySelectorAll('[data-auth-required]').forEach(el => {
            el.style.display = isLoggedIn ? '' : 'none';
        });

        // Elements only visible when NOT logged in
        document.querySelectorAll('[data-auth-hidden]').forEach(el => {
            el.style.display = isLoggedIn ? 'none' : '';
        });

        // Update navbar auth section
        const authNav = document.getElementById('auth-nav');
        if (authNav) {
            if (isLoggedIn && currentUser) {
                authNav.innerHTML = `
                    <span class="auth-user-name">${escapeHtml(currentUser.display_name)}</span>
                    <button class="btn btn-sm btn-outline auth-logout-btn" id="logout-btn">Logout</button>
                `;
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', handleLogout);
                }
            } else {
                const basePath = typeof Nav !== 'undefined' ? Nav.getBasePath() : '../';
                const loginPage = basePath + 'pages/login.html';
                authNav.innerHTML = `
                    <a href="${loginPage}" class="btn btn-sm btn-primary auth-login-btn">HR Login</a>
                `;
            }
        }
    }

    /**
     * Handle logout button click.
     */
    async function handleLogout() {
        await logout();
        if (typeof Toast !== 'undefined') {
            Toast.success('Logged out successfully.');
        }
        updateUI();
    }

    /**
     * Initialize auth: check status and update UI.
     * Call this on DOMContentLoaded for every page.
     */
    async function init() {
        await check();
        updateUI();
    }

    return { check, login, logout, getUser, authenticated, updateUI, init, handleLogout };
})();

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    Auth.init();
});
