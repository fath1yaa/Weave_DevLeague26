<?php
/**
 * Roles API Endpoint - Weave Application
 * 
 * Provides role search and history functionality.
 * 
 * Actions:
 *   ?action=search&q={query}         - Search roles by title or role_id
 *   ?action=history&role_id={id}     - Get chronological history of a role
 *   ?action=detail&role_id={id}      - Get current role details
 */

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/helpers.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

$action = isset($_GET['action']) ? sanitizeInput($_GET['action']) : '';

switch ($action) {
    case 'search':
        handleSearch();
        break;
    case 'history':
        handleHistory();
        break;
    case 'detail':
        handleDetail();
        break;
    default:
        errorResponse('Invalid action. Use: search, history, or detail', 400);
}

/**
 * Search roles by title or role_id
 * GET ?action=search&q={query}
 */
function handleSearch() {
    $query = isset($_GET['q']) ? sanitizeInput($_GET['q']) : '';

    if (strlen($query) < 1) {
        errorResponse('Search query must be at least 1 character', 400);
    }

    $pdo = getConnection();
    $searchTerm = '%' . $query . '%';

    $stmt = $pdo->prepare("
        SELECT r.role_id, r.title, r.department, r.reports_to, 
               r.effective_from, r.effective_to,
               (SELECT p.name FROM role_assignments ra 
                JOIN people p ON p.person_id = ra.person_id 
                WHERE ra.role_id = r.role_id AND ra.end_date IS NULL 
                LIMIT 1) AS current_occupant
        FROM roles r
        WHERE r.title LIKE :q1 OR r.role_id LIKE :q2
        ORDER BY r.title ASC
        LIMIT 20
    ");
    $stmt->execute([':q1' => $searchTerm, ':q2' => $searchTerm]);
    $results = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'count'   => count($results),
        'results' => $results
    ]);
}

/**
 * Get chronological history of a role including events and occupants
 * GET ?action=history&role_id={id}
 */
function handleHistory() {
    $roleId = isset($_GET['role_id']) ? sanitizeInput($_GET['role_id']) : '';

    if (empty($roleId)) {
        errorResponse('role_id parameter is required', 400);
    }

    $pdo = getConnection();

    // Get role details
    $stmt = $pdo->prepare("
        SELECT role_id, title, department, reports_to, effective_from, effective_to
        FROM roles WHERE role_id = :role_id
    ");
    $stmt->execute([':role_id' => $roleId]);
    $role = $stmt->fetch();

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Get events for this role (chronological timeline of changes)
    $stmt = $pdo->prepare("
        SELECT event_id, event_type, previous_value, new_value, 
               effective_date, description
        FROM events 
        WHERE entity_type = 'role' AND entity_id = :role_id
        ORDER BY effective_date ASC, id ASC
    ");
    $stmt->execute([':role_id' => $roleId]);
    $events = $stmt->fetchAll();

    // Get occupants list ordered by assignment start date
    $stmt = $pdo->prepare("
        SELECT ra.person_id, p.name, ra.start_date, ra.end_date
        FROM role_assignments ra
        JOIN people p ON p.person_id = ra.person_id
        WHERE ra.role_id = :role_id
        ORDER BY ra.start_date ASC
    ");
    $stmt->execute([':role_id' => $roleId]);
    $occupants = $stmt->fetchAll();

    jsonResponse([
        'success'   => true,
        'role'      => $role,
        'events'    => $events,
        'occupants' => $occupants
    ]);
}

/**
 * Get current role details
 * GET ?action=detail&role_id={id}
 */
function handleDetail() {
    $roleId = isset($_GET['role_id']) ? sanitizeInput($_GET['role_id']) : '';

    if (empty($roleId)) {
        errorResponse('role_id parameter is required', 400);
    }

    $pdo = getConnection();

    $stmt = $pdo->prepare("
        SELECT r.role_id, r.title, r.department, r.reports_to, 
               r.effective_from, r.effective_to
        FROM roles r WHERE r.role_id = :role_id
    ");
    $stmt->execute([':role_id' => $roleId]);
    $role = $stmt->fetch();

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Get current occupant
    $stmt = $pdo->prepare("
        SELECT ra.person_id, p.name, ra.start_date
        FROM role_assignments ra
        JOIN people p ON p.person_id = ra.person_id
        WHERE ra.role_id = :role_id AND ra.end_date IS NULL
        LIMIT 1
    ");
    $stmt->execute([':role_id' => $roleId]);
    $currentOccupant = $stmt->fetch();

    // Get reporting role title
    $reportingTitle = null;
    if ($role['reports_to']) {
        $stmt = $pdo->prepare("SELECT title FROM roles WHERE role_id = :role_id");
        $stmt->execute([':role_id' => $role['reports_to']]);
        $parent = $stmt->fetch();
        if ($parent) {
            $reportingTitle = $parent['title'];
        }
    }

    jsonResponse([
        'success'          => true,
        'role'             => $role,
        'current_occupant' => $currentOccupant ?: null,
        'reports_to_title' => $reportingTitle
    ]);
}
