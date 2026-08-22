<?php
/**
 * People API Endpoint - Weave Application
 * 
 * Provides person search and journey functionality.
 * 
 * Actions:
 *   ?action=search&q={query}            - Search people by name or person_id
 *   ?action=journey&person_id={id}      - Get chronological career journey of a person
 *   ?action=detail&person_id={id}       - Get current person details with active role
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
    case 'journey':
        handleJourney();
        break;
    case 'detail':
        handleDetail();
        break;
    default:
        errorResponse('Invalid action. Use: search, journey, or detail', 400);
}

/**
 * Search people by name or person_id
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
        SELECT p.person_id, p.name,
               (SELECT r.title FROM role_assignments ra 
                JOIN roles r ON r.role_id = ra.role_id 
                WHERE ra.person_id = p.person_id AND ra.end_date IS NULL 
                LIMIT 1) AS current_role,
               (SELECT r.department FROM role_assignments ra 
                JOIN roles r ON r.role_id = ra.role_id 
                WHERE ra.person_id = p.person_id AND ra.end_date IS NULL 
                LIMIT 1) AS current_department
        FROM people p
        WHERE p.name LIKE :q1 OR p.person_id LIKE :q2
        ORDER BY p.name ASC
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
 * Get chronological career journey of a person
 * GET ?action=journey&person_id={id}
 */
function handleJourney() {
    $personId = isset($_GET['person_id']) ? sanitizeInput($_GET['person_id']) : '';

    if (empty($personId)) {
        errorResponse('person_id parameter is required', 400);
    }

    $pdo = getConnection();

    // Get person details
    $stmt = $pdo->prepare("SELECT person_id, name FROM people WHERE person_id = :person_id");
    $stmt->execute([':person_id' => $personId]);
    $person = $stmt->fetch();

    if (!$person) {
        errorResponse('Person not found', 404);
    }

    // Get current role and department
    $stmt = $pdo->prepare("
        SELECT ra.role_id, r.title, r.department, ra.start_date
        FROM role_assignments ra
        JOIN roles r ON r.role_id = ra.role_id
        WHERE ra.person_id = :person_id AND ra.end_date IS NULL
        LIMIT 1
    ");
    $stmt->execute([':person_id' => $personId]);
    $currentRole = $stmt->fetch();

    // Get events for this person (chronological timeline of transitions)
    $stmt = $pdo->prepare("
        SELECT event_id, event_type, previous_value, new_value, 
               effective_date, description
        FROM events 
        WHERE entity_type = 'person' AND entity_id = :person_id
        ORDER BY effective_date ASC, id ASC
    ");
    $stmt->execute([':person_id' => $personId]);
    $events = $stmt->fetchAll();

    // Get all role assignments (career path)
    $stmt = $pdo->prepare("
        SELECT ra.role_id, r.title, r.department, ra.start_date, ra.end_date
        FROM role_assignments ra
        JOIN roles r ON r.role_id = ra.role_id
        WHERE ra.person_id = :person_id
        ORDER BY ra.start_date ASC
    ");
    $stmt->execute([':person_id' => $personId]);
    $assignments = $stmt->fetchAll();

    jsonResponse([
        'success'      => true,
        'person'       => $person,
        'current_role' => $currentRole ?: null,
        'events'       => $events,
        'assignments'  => $assignments
    ]);
}

/**
 * Get current person details with active role
 * GET ?action=detail&person_id={id}
 */
function handleDetail() {
    $personId = isset($_GET['person_id']) ? sanitizeInput($_GET['person_id']) : '';

    if (empty($personId)) {
        errorResponse('person_id parameter is required', 400);
    }

    $pdo = getConnection();

    $stmt = $pdo->prepare("SELECT person_id, name FROM people WHERE person_id = :person_id");
    $stmt->execute([':person_id' => $personId]);
    $person = $stmt->fetch();

    if (!$person) {
        errorResponse('Person not found', 404);
    }

    // Get current role
    $stmt = $pdo->prepare("
        SELECT ra.role_id, r.title, r.department, r.reports_to, ra.start_date
        FROM role_assignments ra
        JOIN roles r ON r.role_id = ra.role_id
        WHERE ra.person_id = :person_id AND ra.end_date IS NULL
        LIMIT 1
    ");
    $stmt->execute([':person_id' => $personId]);
    $currentRole = $stmt->fetch();

    // Get total number of roles held
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as total_roles 
        FROM role_assignments WHERE person_id = :person_id
    ");
    $stmt->execute([':person_id' => $personId]);
    $stats = $stmt->fetch();

    // Get total events
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as total_events 
        FROM events WHERE entity_type = 'person' AND entity_id = :person_id
    ");
    $stmt->execute([':person_id' => $personId]);
    $eventStats = $stmt->fetch();

    jsonResponse([
        'success'      => true,
        'person'       => $person,
        'current_role' => $currentRole ?: null,
        'stats'        => [
            'total_roles'  => (int)$stats['total_roles'],
            'total_events' => (int)$eventStats['total_events']
        ]
    ]);
}
