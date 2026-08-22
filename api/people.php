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

    $people = storeRead('people');
    $assignments = storeRead('role_assignments');
    $roles = storeRead('roles');

    $queryLower = strtolower($query);

    // Filter people by name or person_id
    $filtered = array_filter($people, function ($p) use ($queryLower) {
        return stripos($p['name'], $queryLower) !== false
            || stripos($p['person_id'], $queryLower) !== false;
    });

    // Sort by name ASC
    usort($filtered, function ($a, $b) {
        return strcmp($a['name'], $b['name']);
    });

    // Limit to 20
    $filtered = array_slice($filtered, 0, 20);

    // Index roles by role_id
    $rolesMap = [];
    foreach ($roles as $r) {
        $rolesMap[$r['role_id']] = $r;
    }

    // Build results with current_role and current_department
    $results = [];
    foreach ($filtered as $person) {
        $currentRole = null;
        $currentDepartment = null;

        // Find current assignment (end_date IS NULL)
        foreach ($assignments as $a) {
            if ($a['person_id'] === $person['person_id'] && $a['end_date'] === null) {
                if (isset($rolesMap[$a['role_id']])) {
                    $currentRole = $rolesMap[$a['role_id']]['title'];
                    $currentDepartment = $rolesMap[$a['role_id']]['department'];
                }
                break;
            }
        }

        $results[] = [
            'person_id'          => $person['person_id'],
            'name'               => $person['name'],
            'current_role'       => $currentRole,
            'current_department' => $currentDepartment
        ];
    }

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

    $people = storeRead('people');
    $assignments = storeRead('role_assignments');
    $roles = storeRead('roles');
    $events = storeRead('events');

    // Find person
    $person = null;
    foreach ($people as $p) {
        if ($p['person_id'] === $personId) {
            $person = $p;
            break;
        }
    }

    if (!$person) {
        errorResponse('Person not found', 404);
    }

    // Index roles
    $rolesMap = [];
    foreach ($roles as $r) {
        $rolesMap[$r['role_id']] = $r;
    }

    // Get current role
    $currentRole = null;
    foreach ($assignments as $a) {
        if ($a['person_id'] === $personId && $a['end_date'] === null) {
            if (isset($rolesMap[$a['role_id']])) {
                $currentRole = [
                    'role_id'    => $a['role_id'],
                    'title'      => $rolesMap[$a['role_id']]['title'],
                    'department' => $rolesMap[$a['role_id']]['department'],
                    'start_date' => $a['start_date']
                ];
            }
            break;
        }
    }

    // Get events for this person
    $personEvents = array_values(array_filter($events, function ($e) use ($personId) {
        return $e['entity_type'] === 'person' && $e['entity_id'] === $personId;
    }));

    // Sort events by effective_date ASC
    usort($personEvents, function ($a, $b) {
        return strcmp($a['effective_date'], $b['effective_date']);
    });

    // Format events
    $formattedEvents = [];
    foreach ($personEvents as $e) {
        $formattedEvents[] = [
            'event_id'       => $e['event_id'],
            'event_type'     => $e['event_type'],
            'previous_value' => $e['previous_value'],
            'new_value'      => $e['new_value'],
            'effective_date' => $e['effective_date'],
            'description'    => $e['description']
        ];
    }

    // Get all role assignments (career path)
    $personAssignments = array_values(array_filter($assignments, function ($a) use ($personId) {
        return $a['person_id'] === $personId;
    }));

    // Sort by start_date ASC
    usort($personAssignments, function ($a, $b) {
        return strcmp($a['start_date'], $b['start_date']);
    });

    // Build assignments with role info
    $formattedAssignments = [];
    foreach ($personAssignments as $a) {
        $roleInfo = isset($rolesMap[$a['role_id']]) ? $rolesMap[$a['role_id']] : null;
        $formattedAssignments[] = [
            'role_id'    => $a['role_id'],
            'title'      => $roleInfo ? $roleInfo['title'] : null,
            'department' => $roleInfo ? $roleInfo['department'] : null,
            'start_date' => $a['start_date'],
            'end_date'   => $a['end_date']
        ];
    }

    jsonResponse([
        'success'      => true,
        'person'       => $person,
        'current_role' => $currentRole ?: null,
        'events'       => $formattedEvents,
        'assignments'  => $formattedAssignments
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

    $people = storeRead('people');
    $assignments = storeRead('role_assignments');
    $roles = storeRead('roles');
    $events = storeRead('events');

    // Find person
    $person = null;
    foreach ($people as $p) {
        if ($p['person_id'] === $personId) {
            $person = $p;
            break;
        }
    }

    if (!$person) {
        errorResponse('Person not found', 404);
    }

    // Index roles
    $rolesMap = [];
    foreach ($roles as $r) {
        $rolesMap[$r['role_id']] = $r;
    }

    // Get current role
    $currentRole = null;
    foreach ($assignments as $a) {
        if ($a['person_id'] === $personId && $a['end_date'] === null) {
            if (isset($rolesMap[$a['role_id']])) {
                $currentRole = [
                    'role_id'    => $a['role_id'],
                    'title'      => $rolesMap[$a['role_id']]['title'],
                    'department' => $rolesMap[$a['role_id']]['department'],
                    'reports_to' => $rolesMap[$a['role_id']]['reports_to'],
                    'start_date' => $a['start_date']
                ];
            }
            break;
        }
    }

    // Count total roles held
    $totalRoles = 0;
    foreach ($assignments as $a) {
        if ($a['person_id'] === $personId) {
            $totalRoles++;
        }
    }

    // Count total events
    $totalEvents = 0;
    foreach ($events as $e) {
        if ($e['entity_type'] === 'person' && $e['entity_id'] === $personId) {
            $totalEvents++;
        }
    }

    jsonResponse([
        'success'      => true,
        'person'       => $person,
        'current_role' => $currentRole ?: null,
        'stats'        => [
            'total_roles'  => $totalRoles,
            'total_events' => $totalEvents
        ]
    ]);
}
