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

require_once __DIR__ . '/includes/store.php';
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
 * Get connections for a role.
 * Finds people who held this role and other roles they held,
 * plus temporally correlated events (within a 30-day window).
 */
function handleRoleConnections($roleId) {
    $roles = storeRead('roles');
    $events = storeRead('events');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');

    // Verify role exists
    $role = null;
    foreach ($roles as $r) {
        if ($r['role_id'] === $roleId) {
            $role = ['role_id' => $r['role_id'], 'title' => $r['title'], 'department' => $r['department']];
            break;
        }
    }

    if (!$role) {
        errorResponse('Role not found', 404);
    }

    // Index people by person_id
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p['name'];
    }

    // Index roles by role_id
    $rolesMap = [];
    foreach ($roles as $r) {
        $rolesMap[$r['role_id']] = $r['title'];
    }

    // Get events for this role
    $roleEvents = [];
    foreach ($events as $e) {
        if ($e['entity_type'] === 'role' && $e['entity_id'] === $roleId) {
            $roleEvents[] = [
                'event_id'       => $e['event_id'],
                'event_type'     => $e['event_type'],
                'effective_date' => $e['effective_date'],
                'description'    => $e['description'],
                'previous_value' => $e['previous_value'],
                'new_value'      => $e['new_value']
            ];
        }
    }

    // Sort by effective_date ASC
    usort($roleEvents, function ($a, $b) {
        return strcmp($a['effective_date'], $b['effective_date']);
    });

    // Find temporally correlated events (within 30-day window)
    $correlatedEvents = [];
    foreach ($roleEvents as $event) {
        $eventDate = strtotime($event['effective_date']);
        $correlated = [];

        foreach ($events as $e) {
            if ($e['entity_id'] === $roleId) continue; // Skip self

            $otherDate = strtotime($e['effective_date']);
            $daysDiff = abs(($otherDate - $eventDate) / 86400);

            if ($daysDiff <= 30) {
                // Get entity name
                $entityName = null;
                if ($e['entity_type'] === 'role' && isset($rolesMap[$e['entity_id']])) {
                    $entityName = $rolesMap[$e['entity_id']];
                } elseif ($e['entity_type'] === 'person' && isset($peopleMap[$e['entity_id']])) {
                    $entityName = $peopleMap[$e['entity_id']];
                }

                $correlated[] = [
                    'event_id'       => $e['event_id'],
                    'event_type'     => $e['event_type'],
                    'entity_type'    => $e['entity_type'],
                    'entity_id'      => $e['entity_id'],
                    'effective_date' => $e['effective_date'],
                    'description'    => $e['description'],
                    'previous_value' => $e['previous_value'],
                    'new_value'      => $e['new_value'],
                    'entity_name'    => $entityName
                ];
            }
        }

        // Sort by proximity (closest first), limit to 10
        usort($correlated, function ($a, $b) use ($event) {
            $eventDate = strtotime($event['effective_date']);
            $diffA = abs(strtotime($a['effective_date']) - $eventDate);
            $diffB = abs(strtotime($b['effective_date']) - $eventDate);
            return $diffA - $diffB;
        });
        $correlated = array_slice($correlated, 0, 10);

        if (!empty($correlated)) {
            $correlatedEvents[] = [
                'source_event' => $event,
                'correlated'   => $correlated
            ];
        }
    }

    // Get people connected to this role (occupants)
    $connectedPeople = [];
    foreach ($assignments as $a) {
        if ($a['role_id'] === $roleId) {
            $connectedPeople[] = [
                'person_id'  => $a['person_id'],
                'name'       => isset($peopleMap[$a['person_id']]) ? $peopleMap[$a['person_id']] : null,
                'start_date' => $a['start_date'],
                'end_date'   => $a['end_date']
            ];
        }
    }

    // Sort by start_date DESC
    usort($connectedPeople, function ($a, $b) {
        return strcmp($b['start_date'], $a['start_date']);
    });

    // Get roles in the same department
    $relatedRoles = [];
    if ($role['department']) {
        foreach ($roles as $r) {
            if ($r['department'] === $role['department'] && $r['role_id'] !== $roleId) {
                $relatedRoles[] = [
                    'role_id'    => $r['role_id'],
                    'title'      => $r['title'],
                    'department' => $r['department']
                ];
            }
        }
        // Sort by title ASC, limit to 10
        usort($relatedRoles, function ($a, $b) {
            return strcmp($a['title'], $b['title']);
        });
        $relatedRoles = array_slice($relatedRoles, 0, 10);
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
 * Get connections for a person.
 * Finds roles they held, other people in those roles,
 * plus temporally correlated events (within a 30-day window).
 */
function handlePersonConnections($personId) {
    $roles = storeRead('roles');
    $events = storeRead('events');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');

    // Verify person exists
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

    // Index people by person_id
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p['name'];
    }

    // Index roles by role_id
    $rolesMap = [];
    foreach ($roles as $r) {
        $rolesMap[$r['role_id']] = $r;
    }

    // Get events for this person
    $personEvents = [];
    foreach ($events as $e) {
        if ($e['entity_type'] === 'person' && $e['entity_id'] === $personId) {
            $personEvents[] = [
                'event_id'       => $e['event_id'],
                'event_type'     => $e['event_type'],
                'effective_date' => $e['effective_date'],
                'description'    => $e['description'],
                'previous_value' => $e['previous_value'],
                'new_value'      => $e['new_value']
            ];
        }
    }

    // Sort by effective_date ASC
    usort($personEvents, function ($a, $b) {
        return strcmp($a['effective_date'], $b['effective_date']);
    });

    // Find temporally correlated events (within 30-day window)
    $correlatedEvents = [];
    foreach ($personEvents as $event) {
        $eventDate = strtotime($event['effective_date']);
        $correlated = [];

        foreach ($events as $e) {
            if ($e['entity_id'] === $personId) continue; // Skip self

            $otherDate = strtotime($e['effective_date']);
            $daysDiff = abs(($otherDate - $eventDate) / 86400);

            if ($daysDiff <= 30) {
                // Get entity name
                $entityName = null;
                if ($e['entity_type'] === 'role' && isset($rolesMap[$e['entity_id']])) {
                    $entityName = $rolesMap[$e['entity_id']]['title'];
                } elseif ($e['entity_type'] === 'person' && isset($peopleMap[$e['entity_id']])) {
                    $entityName = $peopleMap[$e['entity_id']];
                }

                $correlated[] = [
                    'event_id'       => $e['event_id'],
                    'event_type'     => $e['event_type'],
                    'entity_type'    => $e['entity_type'],
                    'entity_id'      => $e['entity_id'],
                    'effective_date' => $e['effective_date'],
                    'description'    => $e['description'],
                    'previous_value' => $e['previous_value'],
                    'new_value'      => $e['new_value'],
                    'entity_name'    => $entityName
                ];
            }
        }

        // Sort by proximity, limit to 10
        usort($correlated, function ($a, $b) use ($event) {
            $eventDate = strtotime($event['effective_date']);
            $diffA = abs(strtotime($a['effective_date']) - $eventDate);
            $diffB = abs(strtotime($b['effective_date']) - $eventDate);
            return $diffA - $diffB;
        });
        $correlated = array_slice($correlated, 0, 10);

        if (!empty($correlated)) {
            $correlatedEvents[] = [
                'source_event' => $event,
                'correlated'   => $correlated
            ];
        }
    }

    // Get roles connected to this person
    $connectedRoles = [];
    foreach ($assignments as $a) {
        if ($a['person_id'] === $personId) {
            $roleInfo = isset($rolesMap[$a['role_id']]) ? $rolesMap[$a['role_id']] : null;
            $connectedRoles[] = [
                'role_id'    => $a['role_id'],
                'title'      => $roleInfo ? $roleInfo['title'] : null,
                'department' => $roleInfo ? $roleInfo['department'] : null,
                'start_date' => $a['start_date'],
                'end_date'   => $a['end_date']
            ];
        }
    }

    // Sort by start_date DESC
    usort($connectedRoles, function ($a, $b) {
        return strcmp($b['start_date'], $a['start_date']);
    });

    // Get other people who held the same roles
    $relatedPeople = [];
    foreach ($connectedRoles as $role) {
        $others = [];
        foreach ($assignments as $a) {
            if ($a['role_id'] === $role['role_id'] && $a['person_id'] !== $personId) {
                $others[] = [
                    'person_id'  => $a['person_id'],
                    'name'       => isset($peopleMap[$a['person_id']]) ? $peopleMap[$a['person_id']] : null,
                    'start_date' => $a['start_date'],
                    'end_date'   => $a['end_date']
                ];
            }
        }

        if (!empty($others)) {
            // Sort by start_date DESC, limit to 5
            usort($others, function ($a, $b) {
                return strcmp($b['start_date'], $a['start_date']);
            });
            $others = array_slice($others, 0, 5);

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
