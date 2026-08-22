<?php
/**
 * Org Chart API Endpoint - Weave Application
 * 
 * Provides temporal org chart state queries.
 * 
 * Actions:
 *   ?date=YYYY-MM-DD          - Get org structure at a specific date
 *   ?action=date_range        - Get min/max date bounds from all data
 */

require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/helpers.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

$action = isset($_GET['action']) ? sanitizeInput($_GET['action']) : '';

if ($action === 'date_range') {
    handleDateRange();
} else {
    handleOrgState();
}

/**
 * Get the min/max date range from all data in the system.
 * Used by the timeline slider to set its bounds.
 * GET ?action=date_range
 */
function handleDateRange() {
    $roles = storeRead('roles');
    $assignments = storeRead('role_assignments');
    $events = storeRead('events');

    $today = date('Y-m-d');
    $dates = [];

    // Collect all dates from roles
    foreach ($roles as $role) {
        if (!empty($role['effective_from'])) {
            $dates[] = $role['effective_from'];
        }
        if (!empty($role['effective_to'])) {
            $dates[] = $role['effective_to'];
        } else {
            $dates[] = $today;
        }
    }

    // Collect all dates from assignments
    foreach ($assignments as $a) {
        if (!empty($a['start_date'])) {
            $dates[] = $a['start_date'];
        }
        if (!empty($a['end_date'])) {
            $dates[] = $a['end_date'];
        } else {
            $dates[] = $today;
        }
    }

    // Collect all dates from events
    foreach ($events as $e) {
        if (!empty($e['effective_date'])) {
            $dates[] = $e['effective_date'];
        }
    }

    if (empty($dates)) {
        $range = ['min' => $today, 'max' => $today];
    } else {
        $range = ['min' => min($dates), 'max' => max($dates)];
    }

    jsonResponse([
        'success'    => true,
        'date_range' => $range
    ]);
}

/**
 * Get the organisational structure at a specific date.
 * Returns all roles active on that date with their current occupants and reporting lines.
 * GET ?date=YYYY-MM-DD (defaults to current date if omitted)
 */
function handleOrgState() {
    $date = isset($_GET['date']) ? sanitizeInput($_GET['date']) : date('Y-m-d');

    // Validate date format
    if (!validateDate($date)) {
        errorResponse('Invalid date format. Use YYYY-MM-DD', 400);
    }

    $roles = storeRead('roles');
    $assignments = storeRead('role_assignments');
    $people = storeRead('people');
    $events = storeRead('events');

    // 1. Filter roles active on this date
    $activeRoles = array_filter($roles, function ($r) use ($date) {
        return $r['effective_from'] <= $date
            && ($r['effective_to'] === null || $r['effective_to'] >= $date);
    });

    // Sort by department ASC, title ASC
    usort($activeRoles, function ($a, $b) {
        $deptCmp = strcmp($a['department'], $b['department']);
        if ($deptCmp !== 0) return $deptCmp;
        return strcmp($a['title'], $b['title']);
    });

    // 2. Filter active role assignments on this date
    $activeAssignments = array_filter($assignments, function ($a) use ($date) {
        return $a['start_date'] <= $date
            && ($a['end_date'] === null || $a['end_date'] >= $date);
    });

    // Index assignments by role_id
    $assignmentMap = [];
    foreach ($activeAssignments as $a) {
        $assignmentMap[$a['role_id']] = $a;
    }

    // Index people by person_id
    $peopleMap = [];
    foreach ($people as $p) {
        $peopleMap[$p['person_id']] = $p;
    }

    // 3. Build nodes array with occupant info
    $nodes = [];
    foreach ($activeRoles as $role) {
        $occupant = isset($assignmentMap[$role['role_id']]) ? $assignmentMap[$role['role_id']] : null;
        $occupantName = null;
        $personId = null;

        if ($occupant && isset($peopleMap[$occupant['person_id']])) {
            $occupantName = $peopleMap[$occupant['person_id']]['name'];
            $personId = $occupant['person_id'];
        }

        $nodes[] = [
            'role_id'    => $role['role_id'],
            'title'      => $role['title'],
            'department' => $role['department'],
            'reports_to' => $role['reports_to'],
            'occupant'   => $occupantName,
            'person_id'  => $personId
        ];
    }

    // 4. Get date range for context
    $today = date('Y-m-d');
    $allDates = [];

    foreach ($roles as $r) {
        if (!empty($r['effective_from'])) $allDates[] = $r['effective_from'];
        if (!empty($r['effective_to'])) $allDates[] = $r['effective_to'];
        else $allDates[] = $today;
    }
    foreach ($assignments as $a) {
        if (!empty($a['start_date'])) $allDates[] = $a['start_date'];
        if (!empty($a['end_date'])) $allDates[] = $a['end_date'];
        else $allDates[] = $today;
    }
    foreach ($events as $e) {
        if (!empty($e['effective_date'])) $allDates[] = $e['effective_date'];
    }

    if (empty($allDates)) {
        $range = ['min' => $date, 'max' => $date];
    } else {
        $range = ['min' => min($allDates), 'max' => max($allDates)];
    }

    jsonResponse([
        'success'    => true,
        'date'       => $date,
        'date_range' => $range,
        'node_count' => count($nodes),
        'nodes'      => $nodes
    ]);
}
