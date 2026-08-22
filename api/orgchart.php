<?php
/**
 * Org Chart Temporal Query API Endpoint - Weave Application
 *
 * Reconstructs the organisational structure as it existed on a specific date.
 * Given a ?date=YYYY-MM-DD parameter, it returns the roles active on that date,
 * the person occupying each role (if any), and the reporting-line relationships,
 * assembled into a hierarchical tree.
 *
 * Endpoint: GET /api/orgchart.php?date={YYYY-MM-DD}
 *
 * Response:
 * {
 *   "date": "2023-06-01",
 *   "date_range": { "min": "2020-01-01", "max": "2024-01-01" },
 *   "nodes": [
 *     {
 *       "role_id": "R001",
 *       "title": "Engineering Manager",
 *       "occupant": "Jane Smith",
 *       "person_id": "P005",
 *       "reports_to": "R000",
 *       "department": "Engineering",
 *       "children": [ ... ]
 *     }
 *   ]
 * }
 */

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/helpers.php';

// CORS headers for frontend access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed. Use GET.', 405);
}

// Read and validate the date parameter
$date = isset($_GET['date']) ? sanitizeInput($_GET['date']) : '';

if ($date === '' || !validateDate($date)) {
    errorResponse('Invalid date format', 400);
}

$pdo = getConnection();

// Determine the min/max date range present in the data.
$dateRange = getDataDateRange($pdo);

// If there is no data at all, or the requested date falls outside the imported
// data range, respond with an empty org chart and an informative message.
if ($dateRange['min'] === null || $dateRange['max'] === null
    || $date < $dateRange['min'] || $date > $dateRange['max']) {
    jsonResponse([
        'date'       => $date,
        'date_range' => $dateRange,
        'nodes'      => [],
        'message'    => 'No data for selected date'
    ], 200);
}

// Reconstruct the org state at the requested date.
$nodes = getOrgStateAtDate($pdo, $date);

jsonResponse([
    'date'       => $date,
    'date_range' => $dateRange,
    'nodes'      => $nodes
], 200);

// ============================================================
// Temporal Query Functions
// ============================================================

/**
 * Reconstructs the organisational state at a specific date.
 *
 * 1. Selects roles active on the date:
 *    effective_from <= date AND (effective_to IS NULL OR effective_to >= date)
 * 2. Selects assignments active on the date (joined to people for occupant name):
 *    start_date <= date AND (end_date IS NULL OR end_date >= date)
 * 3. Builds a hierarchical tree from the reports_to relationships.
 *
 * @param PDO    $pdo  Database connection.
 * @param string $date The target date (YYYY-MM-DD).
 * @return array Array of root node arrays, each with a nested "children" array.
 */
function getOrgStateAtDate($pdo, $date) {
    // 1. Roles active on the given date.
    $rolesStmt = $pdo->prepare(
        "SELECT role_id, title, department, reports_to
         FROM roles
         WHERE effective_from <= :date
           AND (effective_to IS NULL OR effective_to >= :date)
         ORDER BY role_id"
    );
    $rolesStmt->execute([':date' => $date]);
    $roles = $rolesStmt->fetchAll();

    // 2. Assignments active on the given date, joined to people for the name.
    $assignmentsStmt = $pdo->prepare(
        "SELECT ra.role_id, ra.person_id, p.name
         FROM role_assignments ra
         JOIN people p ON p.person_id = ra.person_id
         WHERE ra.start_date <= :date
           AND (ra.end_date IS NULL OR ra.end_date >= :date)"
    );
    $assignmentsStmt->execute([':date' => $date]);
    $assignments = $assignmentsStmt->fetchAll();

    // Index the first active occupant per role_id.
    $occupantByRole = [];
    foreach ($assignments as $assignment) {
        $roleId = $assignment['role_id'];
        if (!isset($occupantByRole[$roleId])) {
            $occupantByRole[$roleId] = [
                'occupant'  => $assignment['name'],
                'person_id' => $assignment['person_id']
            ];
        }
    }

    // 3. Build node list, attaching occupant info (or "Vacant" when unoccupied).
    $nodesById = [];
    foreach ($roles as $role) {
        $roleId = $role['role_id'];
        $occupant = isset($occupantByRole[$roleId]) ? $occupantByRole[$roleId]['occupant'] : 'Vacant';
        $personId = isset($occupantByRole[$roleId]) ? $occupantByRole[$roleId]['person_id'] : null;

        $nodesById[$roleId] = [
            'role_id'    => $roleId,
            'title'      => $role['title'],
            'occupant'   => $occupant,
            'person_id'  => $personId,
            'reports_to' => $role['reports_to'],
            'department' => $role['department'],
            'children'   => []
        ];
    }

    return buildHierarchy($nodesById);
}

/**
 * Builds a hierarchical tree from a flat map of nodes using reports_to links.
 *
 * A node becomes a child of its reports_to parent when that parent is also
 * active on the date. Nodes with no reports_to, or whose parent is not present
 * in the active set, are treated as roots so no node is ever lost.
 *
 * @param array $nodesById Map of role_id => node array (each with a "children" array).
 * @return array Array of root node arrays.
 */
function buildHierarchy($nodesById) {
    $roots = [];

    // Attach each node to its parent by reference so nested children populate.
    foreach ($nodesById as $roleId => &$node) {
        $parentId = $node['reports_to'];

        if ($parentId !== null && isset($nodesById[$parentId])) {
            $nodesById[$parentId]['children'][] = &$node;
        } else {
            $roots[] = &$node;
        }
    }
    unset($node);

    return $roots;
}

// ============================================================
// Date Range Helper
// ============================================================

/**
 * Computes the min and max dates present across the imported data.
 *
 * The range spans role effective dates and assignment dates so the timeline
 * slider can cover the full period represented by the data.
 *
 * @param PDO $pdo Database connection.
 * @return array ['min' => 'YYYY-MM-DD'|null, 'max' => 'YYYY-MM-DD'|null]
 */
function getDataDateRange($pdo) {
    $stmt = $pdo->query(
        "SELECT
            MIN(min_date) AS min_date,
            MAX(max_date) AS max_date
         FROM (
            SELECT MIN(effective_from) AS min_date,
                   MAX(COALESCE(effective_to, effective_from)) AS max_date
            FROM roles
            UNION ALL
            SELECT MIN(start_date) AS min_date,
                   MAX(COALESCE(end_date, start_date)) AS max_date
            FROM role_assignments
         ) AS combined"
    );

    $row = $stmt->fetch();

    return [
        'min' => $row['min_date'] ?? null,
        'max' => $row['max_date'] ?? null
    ];
}
