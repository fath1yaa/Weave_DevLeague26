<?php
/**
 * Authentication API Endpoint - Weave Application
 * 
 * Handles login, logout, and session status checks.
 * 
 * Actions:
 *   GET  ?action=check   - Check if user is logged in
 *   POST ?action=login   - Authenticate with username/password
 *   POST ?action=logout  - Destroy session
 */

require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/helpers.php';

// CORS headers
header('Access-Control-Allow-Origin: ' . (isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*'));
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'check':
        handleCheck();
        break;
    case 'login':
        handleLogin();
        break;
    case 'logout':
        handleLogout();
        break;
    default:
        errorResponse('Invalid action. Use: check, login, logout.', 400);
}

/**
 * Check current authentication status.
 */
function handleCheck() {
    if (isAuthenticated()) {
        jsonResponse([
            'authenticated' => true,
            'user' => getCurrentUser()
        ]);
    } else {
        jsonResponse([
            'authenticated' => false,
            'user' => null
        ]);
    }
}

/**
 * Handle login request.
 */
function handleLogin() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        errorResponse('Method not allowed. Use POST for login.', 405);
    }

    // Parse request body
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['username']) || !isset($input['password'])) {
        errorResponse('Username and password are required.', 400);
    }

    $username = trim($input['username']);
    $password = $input['password'];

    if (empty($username) || empty($password)) {
        errorResponse('Username and password cannot be empty.', 400);
    }

    $user = authenticateUser($username, $password);

    if ($user === false) {
        errorResponse('Invalid username or password.', 401);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Login successful.',
        'user' => $user
    ]);
}

/**
 * Handle logout request.
 */
function handleLogout() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        errorResponse('Method not allowed. Use POST for logout.', 405);
    }

    logout();

    jsonResponse([
        'success' => true,
        'message' => 'Logged out successfully.'
    ]);
}
