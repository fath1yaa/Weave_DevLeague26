<?php
/**
 * Authentication Module - Weave Application
 * 
 * Provides session-based authentication for HR staff.
 * Uses PHP sessions and bcrypt password hashing.
 */

require_once __DIR__ . '/store.php';

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Get the users store file path.
 * Extends the store system to include users.
 */
function getUsersFilePath() {
    return DATA_DIR . 'users.json';
}

/**
 * Read all users from the store.
 * @return array
 */
function readUsers() {
    $filePath = getUsersFilePath();
    if (!file_exists($filePath)) {
        return [];
    }
    $content = file_get_contents($filePath);
    if ($content === false || trim($content) === '') {
        return [];
    }
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

/**
 * Find a user by username.
 * @param string $username
 * @return array|null
 */
function findUserByUsername($username) {
    $users = readUsers();
    foreach ($users as $user) {
        if (isset($user['username']) && $user['username'] === $username) {
            return $user;
        }
    }
    return null;
}

/**
 * Attempt to authenticate a user with username and password.
 * @param string $username
 * @param string $password
 * @return array|false Returns user data (without password) on success, false on failure.
 */
function authenticateUser($username, $password) {
    $user = findUserByUsername($username);
    if ($user === null) {
        return false;
    }

    if (!password_verify($password, $user['password_hash'])) {
        return false;
    }

    // Store user in session (without password hash)
    $sessionUser = [
        'id' => $user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'],
        'role' => $user['role']
    ];

    $_SESSION['user'] = $sessionUser;
    $_SESSION['logged_in'] = true;

    return $sessionUser;
}

/**
 * Check if the current request is authenticated.
 * @return bool
 */
function isAuthenticated() {
    return isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true && isset($_SESSION['user']);
}

/**
 * Get the currently logged-in user data.
 * @return array|null
 */
function getCurrentUser() {
    if (isAuthenticated()) {
        return $_SESSION['user'];
    }
    return null;
}

/**
 * Destroy the session and log the user out.
 */
function logout() {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    session_destroy();
}

/**
 * Middleware: Require authentication for the current request.
 * Sends a 401 JSON response and exits if not authenticated.
 */
function requireAuth() {
    if (!isAuthenticated()) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => 'Authentication required. Please log in.'
        ]);
        exit;
    }
}
