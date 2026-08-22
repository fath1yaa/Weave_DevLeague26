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

require_once __DIR__ . '/includes/store.php';
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
    case 'departments':
        handleDepartments();
        break;
    default:
        errorResponse('Invalid action. Use: search, history, detail, or departments', 400);
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

    $roles = storeRead('roles');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');

    $queryLower = strtolower($query);

    // Filter roles by title or role_id containing query
    $filtered = array_filter($roles, function ($r) use ($queryLower) {
        return stripos($r['title'], $queryLower) !== false
            || stripos($r['role_id'], $queryLower) !== false;
    });

    // Sort by title ASC
    usort($filtered, function ($a, $b) {
        return strcmp($a['title'], $b['title']);
    });

    // Limit to 20 results
    $filtered = array_slice($filtered, 0, 20);

    // Index people by person_id
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p['name'];
    }

    // Build results with current_occupant
    $results = [];
    foreach ($filtered as $role) {
        // Find current occupant (end_date IS NULL)
        $currentOccupant = null;
        foreach ($assignments as $a) {
            if ($a['role_id'] === $role['role_id'] && $a['end_date'] === null) {
                if (isset($peopleMap[$a['person_id']])) {
                    $currentOccupant = $peopleMap[$a['person_id']];
                }
                break;
            }
        }

        $results[] = [
            'role_id'          => $role['role_id'],
            'title'            => $role['title'],
            'department'       => $role['department'],
            'reports_to'       => $role['reports_to'],
            'effective_from'   => $role['effective_from'],
            'effective_to'     => $role['effective_to'],
            'current_occupant' => $currentOccupant
        ];
    }

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

    $roles = storeRead('roles');
    $events = storeRead('events');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');

    // Find the role
    $role = null;
    foreach ($roles as $r) {
        if ($r['role_id'] === $roleId) {
            $role = $r;
            break;
        }
    }

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Get events for this role
    $roleEvents = array_values(array_filter($events, function ($e) use ($roleId) {
        return $e['entity_type'] === 'role' && $e['entity_id'] === $roleId;
    }));

    // Sort events by effective_date ASC
    usort($roleEvents, function ($a, $b) {
        return strcmp($a['effective_date'], $b['effective_date']);
    });

    // Format events for response
    $formattedEvents = [];
    foreach ($roleEvents as $e) {
        $formattedEvents[] = [
            'event_id'       => $e['event_id'],
            'event_type'     => $e['event_type'],
            'previous_value' => $e['previous_value'],
            'new_value'      => $e['new_value'],
            'effective_date' => $e['effective_date'],
            'description'    => $e['description']
        ];
    }

    // Get occupants for this role
    $roleAssignments = array_values(array_filter($assignments, function ($a) use ($roleId) {
        return $a['role_id'] === $roleId;
    }));

    // Sort by start_date ASC
    usort($roleAssignments, function ($a, $b) {
        return strcmp($a['start_date'], $b['start_date']);
    });

    // Index people
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p['name'];
    }

    $occupants = [];
    foreach ($roleAssignments as $a) {
        $occupants[] = [
            'person_id'  => $a['person_id'],
            'name'       => isset($peopleMap[$a['person_id']]) ? $peopleMap[$a['person_id']] : null,
            'start_date' => $a['start_date'],
            'end_date'   => $a['end_date']
        ];
    }

    jsonResponse([
        'success'   => true,
        'role'      => $role,
        'events'    => $formattedEvents,
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

    $roles = storeRead('roles');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');

    // Find the role
    $role = null;
    foreach ($roles as $r) {
        if ($r['role_id'] === $roleId) {
            $role = $r;
            break;
        }
    }

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Index people
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p;
    }

    // Get current occupant (end_date IS NULL)
    $currentOccupant = null;
    foreach ($assignments as $a) {
        if ($a['role_id'] === $roleId && $a['end_date'] === null) {
            if (isset($peopleMap[$a['person_id']])) {
                $currentOccupant = [
                    'person_id'  => $a['person_id'],
                    'name'       => $peopleMap[$a['person_id']]['name'],
                    'start_date' => $a['start_date']
                ];
            }
            break;
        }
    }

    // Get reporting role title
    $reportingTitle = null;
    if ($role['reports_to']) {
        foreach ($roles as $r) {
            if ($r['role_id'] === $role['reports_to']) {
                $reportingTitle = $r['title'];
                break;
            }
        }
    }

    jsonResponse([
        'success'          => true,
        'role'             => $role,
        'current_occupant' => $currentOccupant ?: null,
        'reports_to_title' => $reportingTitle
    ]);
}

/**
 * Get all unique departments from roles data
 * GET ?action=departments
 */
function handleDepartments() {
    $roles = storeRead('roles');

    // Collect unique departments with role counts
    $departments = [];
    foreach ($roles as $role) {
        $dept = $role['department'];
        if (!empty($dept)) {
            if (!isset($departments[$dept])) {
                $departments[$dept] = [
                    'name'       => $dept,
                    'role_count' => 0,
                    'roles'      => []
                ];
            }
            $departments[$dept]['role_count']++;
            $departments[$dept]['roles'][] = [
                'role_id' => $role['role_id'],
                'title'   => $role['title']
            ];
        }
    }

    // Sort by department name
    ksort($departments);
    $result = array_values($departments);

    jsonResponse([
        'success'     => true,
        'count'       => count($result),
        'departments' => $result
    ]);
}
