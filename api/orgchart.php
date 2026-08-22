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

require_once __DIR__ . '/includes/db.php';
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
    $pdo = getConnection();

    // Get earliest and latest dates across all temporal tables
    $stmt = $pdo->query("
        SELECT 
            LEAST(
                COALESCE((SELECT MIN(effective_from) FROM roles), CURDATE()),
                COALESCE((SELECT MIN(start_date) FROM role_assignments), CURDATE()),
                COALESCE((SELECT MIN(effective_date) FROM events), CURDATE())
            ) AS min_date,
            GREATEST(
                COALESCE((SELECT MAX(COALESCE(effective_to, CURDATE())) FROM roles), CURDATE()),
                COALESCE((SELECT MAX(COALESCE(end_date, CURDATE())) FROM role_assignments), CURDATE()),
                COALESCE((SELECT MAX(effective_date) FROM events), CURDATE())
            ) AS max_date
    ");
    $range = $stmt->fetch();

    // If no data exists at all, return today as both bounds
    if (!$range || !$range['min_date']) {
        $range = [
            'min_date' => date('Y-m-d'),
            'max_date' => date('Y-m-d')
        ];
    }

    jsonResponse([
        'success'    => true,
        'date_range' => [
            'min' => $range['min_date'],
            'max' => $range['max_date']
        ]
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

    $pdo = getConnection();

    // 1. Get all roles active on this date
    $stmt = $pdo->prepare("
        SELECT r.role_id, r.title, r.department, r.reports_to, 
               r.effective_from, r.effective_to
        FROM roles r
        WHERE r.effective_from <= :date1
          AND (r.effective_to IS NULL OR r.effective_to >= :date2)
        ORDER BY r.department ASC, r.title ASC
    ");
    $stmt->execute([':date1' => $date, ':date2' => $date]);
    $roles = $stmt->fetchAll();

    // 2. Get all active role assignments on this date
    $stmt = $pdo->prepare("
        SELECT ra.role_id, ra.person_id, p.name
        FROM role_assignments ra
        JOIN people p ON p.person_id = ra.person_id
        WHERE ra.start_date <= :date1
          AND (ra.end_date IS NULL OR ra.end_date >= :date2)
    ");
    $stmt->execute([':date1' => $date, ':date2' => $date]);
    $assignments = $stmt->fetchAll();

    // Index assignments by role_id for fast lookup
    $assignmentMap = [];
    foreach ($assignments as $a) {
        $assignmentMap[$a['role_id']] = $a;
    }

    // 3. Build nodes array with occupant info
    $nodes = [];
    foreach ($roles as $role) {
        $occupant = isset($assignmentMap[$role['role_id']]) 
            ? $assignmentMap[$role['role_id']] 
            : null;

        $nodes[] = [
            'role_id'    => $role['role_id'],
            'title'      => $role['title'],
            'department' => $role['department'],
            'reports_to' => $role['reports_to'],
            'occupant'   => $occupant ? $occupant['name'] : null,
            'person_id'  => $occupant ? $occupant['person_id'] : null
        ];
    }

    // 4. Get date range for context
    $stmtRange = $pdo->query("
        SELECT 
            LEAST(
                COALESCE((SELECT MIN(effective_from) FROM roles), CURDATE()),
                COALESCE((SELECT MIN(start_date) FROM role_assignments), CURDATE()),
                COALESCE((SELECT MIN(effective_date) FROM events), CURDATE())
            ) AS min_date,
            GREATEST(
                COALESCE((SELECT MAX(COALESCE(effective_to, CURDATE())) FROM roles), CURDATE()),
                COALESCE((SELECT MAX(COALESCE(end_date, CURDATE())) FROM role_assignments), CURDATE()),
                COALESCE((SELECT MAX(effective_date) FROM events), CURDATE())
            ) AS max_date
    ");
    $range = $stmtRange->fetch();

    if (!$range || !$range['min_date']) {
        $range = ['min_date' => $date, 'max_date' => $date];
    }

    jsonResponse([
        'success'    => true,
        'date'       => $date,
        'date_range' => [
            'min' => $range['min_date'],
            'max' => $range['max_date']
        ],
        'node_count' => count($nodes),
        'nodes'      => $nodes
    ]);
}
