<?php
/**
 * Connections API Endpoint - Weave Application
 * 
 * Provides temporal correlation detection between roles and people.
 * Finds events that share the same time window, indicating related changes.
 * 
 * Actions:
 *   ?type=role&id={role_id}       - Get connections for a role
 *   ?type=person&id={person_id}   - Get connections for a person
 */

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/helpers.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

$type = isset($_GET['type']) ? sanitizeInput($_GET['type']) : '';
$id = isset($_GET['id']) ? sanitizeInput($_GET['id']) : '';

if (empty($type) || !in_array($type, ['role', 'person'])) {
    errorResponse('Invalid type. Use: role or person', 400);
}

if (empty($id)) {
    errorResponse('id parameter is required', 400);
}

switch ($type) {
    case 'role':
        handleRoleConnections($id);
        break;
    case 'person':
        handlePersonConnections($id);
        break;
}

/**
 * Get connections for a role
 * Finds people who held this role and other roles they held,
 * plus temporally correlated events (within a 30-day window).
 */
function handleRoleConnections($roleId) {
    $pdo = getConnection();

    // Verify role exists
    $stmt = $pdo->prepare("SELECT role_id, title, department FROM roles WHERE role_id = :id");
    $stmt->execute([':id' => $roleId]);
    $role = $stmt->fetch();

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Get events for this role
    $stmt = $pdo->prepare("
        SELECT event_id, event_type, effective_date, description, previous_value, new_value
        FROM events 
        WHERE entity_type = 'role' AND entity_id = :id
        ORDER BY effective_date ASC
    ");
    $stmt->execute([':id' => $roleId]);
    $roleEvents = $stmt->fetchAll();

    // Find temporally correlated events (events of other entities within 30-day window)
    $correlatedEvents = [];
    foreach ($roleEvents as $event) {
        $stmt = $pdo->prepare("
            SELECT e.event_id, e.event_type, e.entity_type, e.entity_id, 
                   e.effective_date, e.description, e.previous_value, e.new_value,
                   CASE 
                       WHEN e.entity_type = 'role' THEN (SELECT title FROM roles WHERE role_id = e.entity_id)
                       WHEN e.entity_type = 'person' THEN (SELECT name FROM people WHERE person_id = e.entity_id)
                   END AS entity_name
            FROM events e
            WHERE e.entity_id != :entity_id
              AND ABS(DATEDIFF(e.effective_date, :event_date)) <= 30
            ORDER BY ABS(DATEDIFF(e.effective_date, :event_date2)) ASC
            LIMIT 10
        ");
        $stmt->execute([
            ':entity_id'  => $roleId,
            ':event_date' => $event['effective_date'],
            ':event_date2' => $event['effective_date']
        ]);
        $correlated = $stmt->fetchAll();

        if (!empty($correlated)) {
            $correlatedEvents[] = [
                'source_event' => $event,
                'correlated'   => $correlated
            ];
        }
    }

    // Get people connected to this role (occupants)
    $stmt = $pdo->prepare("
        SELECT ra.person_id, p.name, ra.start_date, ra.end_date
        FROM role_assignments ra
        JOIN people p ON p.person_id = ra.person_id
        WHERE ra.role_id = :role_id
        ORDER BY ra.start_date DESC
    ");
    $stmt->execute([':role_id' => $roleId]);
    $connectedPeople = $stmt->fetchAll();

    // Get roles in the same department
    $relatedRoles = [];
    if ($role['department']) {
        $stmt = $pdo->prepare("
            SELECT role_id, title, department 
            FROM roles 
            WHERE department = :dept AND role_id != :role_id
            ORDER BY title ASC
            LIMIT 10
        ");
        $stmt->execute([':dept' => $role['department'], ':role_id' => $roleId]);
        $relatedRoles = $stmt->fetchAll();
    }

    jsonResponse([
        'success'           => true,
        'entity_type'       => 'role',
        'entity'            => $role,
        'connected_people'  => $connectedPeople,
        'related_roles'     => $relatedRoles,
        'correlated_events' => $correlatedEvents
    ]);
}

/**
 * Get connections for a person
 * Finds roles they held, other people in those roles,
 * plus temporally correlated events (within a 30-day window).
 */
function handlePersonConnections($personId) {
    $pdo = getConnection();

    // Verify person exists
    $stmt = $pdo->prepare("SELECT person_id, name FROM people WHERE person_id = :id");
    $stmt->execute([':id' => $personId]);
    $person = $stmt->fetch();

    if (!$person) {
        errorResponse('Person not found', 404);
    }

    // Get events for this person
    $stmt = $pdo->prepare("
        SELECT event_id, event_type, effective_date, description, previous_value, new_value
        FROM events 
        WHERE entity_type = 'person' AND entity_id = :id
        ORDER BY effective_date ASC
    ");
    $stmt->execute([':id' => $personId]);
    $personEvents = $stmt->fetchAll();

    // Find temporally correlated events (within 30-day window)
    $correlatedEvents = [];
    foreach ($personEvents as $event) {
        $stmt = $pdo->prepare("
            SELECT e.event_id, e.event_type, e.entity_type, e.entity_id, 
                   e.effective_date, e.description, e.previous_value, e.new_value,
                   CASE 
                       WHEN e.entity_type = 'role' THEN (SELECT title FROM roles WHERE role_id = e.entity_id)
                       WHEN e.entity_type = 'person' THEN (SELECT name FROM people WHERE person_id = e.entity_id)
                   END AS entity_name
            FROM events e
            WHERE e.entity_id != :entity_id
              AND ABS(DATEDIFF(e.effective_date, :event_date)) <= 30
            ORDER BY ABS(DATEDIFF(e.effective_date, :event_date2)) ASC
            LIMIT 10
        ");
        $stmt->execute([
            ':entity_id'  => $personId,
            ':event_date' => $event['effective_date'],
            ':event_date2' => $event['effective_date']
        ]);
        $correlated = $stmt->fetchAll();

        if (!empty($correlated)) {
            $correlatedEvents[] = [
                'source_event' => $event,
                'correlated'   => $correlated
            ];
        }
    }

    // Get roles connected to this person
    $stmt = $pdo->prepare("
        SELECT ra.role_id, r.title, r.department, ra.start_date, ra.end_date
        FROM role_assignments ra
        JOIN roles r ON r.role_id = ra.role_id
        WHERE ra.person_id = :person_id
        ORDER BY ra.start_date DESC
    ");
    $stmt->execute([':person_id' => $personId]);
    $connectedRoles = $stmt->fetchAll();

    // Get other people who held the same roles
    $relatedPeople = [];
    foreach ($connectedRoles as $role) {
        $stmt = $pdo->prepare("
            SELECT ra.person_id, p.name, ra.start_date, ra.end_date
            FROM role_assignments ra
            JOIN people p ON p.person_id = ra.person_id
            WHERE ra.role_id = :role_id AND ra.person_id != :person_id
            ORDER BY ra.start_date DESC
            LIMIT 5
        ");
        $stmt->execute([':role_id' => $role['role_id'], ':person_id' => $personId]);
        $others = $stmt->fetchAll();

        if (!empty($others)) {
            $relatedPeople[] = [
                'via_role' => $role['title'],
                'role_id'  => $role['role_id'],
                'people'   => $others
            ];
        }
    }

    jsonResponse([
        'success'           => true,
        'entity_type'       => 'person',
        'entity'            => $person,
        'connected_roles'   => $connectedRoles,
        'related_people'    => $relatedPeople,
        'correlated_events' => $correlatedEvents
    ]);
}
