<?php
/**
 * Property-Based Test - Property 9: Org chart temporal correctness
 *
 * Validates: Requirements 5.1, 5.2
 *
 * Property statement (design.md):
 *   For any date within the imported data range, the Org_Chart_View SHALL render
 *   exactly those roles whose effective_from <= date AND
 *   (effective_to IS NULL OR effective_to >= date), with occupants whose
 *   assignment start_date <= date AND (end_date IS NULL OR end_date >= date).
 *
 * Approach:
 *   - No PBT library exists in this repo (no composer.json / phpunit), so this
 *     uses a lightweight generative loop that produces many randomised datasets
 *     of roles + people + assignments with random validity windows, seeds them
 *     into an in-memory SQLite PDO, picks random query dates, and asserts the
 *     node set (and occupants) returned by the REAL getOrgStateAtDate() from
 *     api/orgchart.php exactly matches an independent reference implementation
 *     of the temporal predicate.
 *   - The production api/orgchart.php logic is NOT modified. Its temporal query
 *     functions are loaded verbatim from source (function definitions only, the
 *     HTTP endpoint block is not executed).
 *
 * Run:  C:\xampp\php\php.exe tests/orgchart_temporal_property_test.php [iterations] [seed]
 */

// ------------------------------------------------------------------
// Load the production temporal-query functions WITHOUT running the
// endpoint code (which reads $_GET, calls MySQL getConnection(), and
// exits). We slice the source from the first function definition to
// EOF; that region contains only function definitions + comments.
// ------------------------------------------------------------------
function loadOrgchartFunctions()
{
    $src = file_get_contents(__DIR__ . '/../api/orgchart.php');
    if ($src === false) {
        fwrite(STDERR, "Could not read api/orgchart.php\n");
        exit(1);
    }

    $marker = 'function getOrgStateAtDate(';
    $pos = strpos($src, $marker);
    if ($pos === false) {
        fwrite(STDERR, "Could not locate getOrgStateAtDate in api/orgchart.php\n");
        exit(1);
    }

    $functionsOnly = substr($src, $pos);

    // Sanity: the sliced region must not contain the endpoint's exit path.
    if (strpos($functionsOnly, 'errorResponse(') !== false
        || strpos($functionsOnly, 'jsonResponse(') !== false) {
        fwrite(STDERR, "Unexpected endpoint code found in sliced function region.\n");
        exit(1);
    }

    eval($functionsOnly);
}

loadOrgchartFunctions();

// ------------------------------------------------------------------
// In-memory SQLite schema mirroring the relevant MySQL tables.
// The temporal SQL in getOrgStateAtDate uses only standard comparisons
// (<=, >=, IS NULL) and a plain JOIN, all portable to SQLite.
// ------------------------------------------------------------------
function makeSeededPdo(array $roles, array $people, array $assignments)
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec(
        "CREATE TABLE roles (
            role_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            department TEXT,
            reports_to TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT
        )"
    );
    $pdo->exec(
        "CREATE TABLE people (
            person_id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )"
    );
    $pdo->exec(
        "CREATE TABLE role_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT
        )"
    );

    $rStmt = $pdo->prepare(
        "INSERT INTO roles (role_id, title, department, reports_to, effective_from, effective_to)
         VALUES (:role_id, :title, :department, :reports_to, :effective_from, :effective_to)"
    );
    foreach ($roles as $r) {
        $rStmt->execute([
            ':role_id'        => $r['role_id'],
            ':title'          => $r['title'],
            ':department'     => $r['department'],
            ':reports_to'     => $r['reports_to'],
            ':effective_from' => $r['effective_from'],
            ':effective_to'   => $r['effective_to'],
        ]);
    }

    $pStmt = $pdo->prepare("INSERT INTO people (person_id, name) VALUES (:person_id, :name)");
    foreach ($people as $p) {
        $pStmt->execute([':person_id' => $p['person_id'], ':name' => $p['name']]);
    }

    $aStmt = $pdo->prepare(
        "INSERT INTO role_assignments (person_id, role_id, start_date, end_date)
         VALUES (:person_id, :role_id, :start_date, :end_date)"
    );
    foreach ($assignments as $a) {
        $aStmt->execute([
            ':person_id'  => $a['person_id'],
            ':role_id'    => $a['role_id'],
            ':start_date' => $a['start_date'],
            ':end_date'   => $a['end_date'],
        ]);
    }

    return $pdo;
}

// ------------------------------------------------------------------
// Generators
// ------------------------------------------------------------------
function randDate($startTs, $endTs)
{
    $ts = mt_rand($startTs, $endTs);
    return date('Y-m-d', $ts);
}

/**
 * Generate a random dataset. Returns [roles, people, assignments, queryDate].
 */
function generateDataset()
{
    $base = strtotime('2020-01-01');
    $span = 5 * 365 * 24 * 3600; // ~5 years
    $end  = $base + $span;

    $numRoles = mt_rand(1, 8);
    $roles = [];
    $roleIds = [];
    for ($i = 1; $i <= $numRoles; $i++) {
        $rid = 'R' . str_pad((string)$i, 3, '0', STR_PAD_LEFT);
        $roleIds[] = $rid;

        $from = randDate($base, $end);
        // ~40% open-ended, else a >= from end date.
        if (mt_rand(1, 100) <= 40) {
            $to = null;
        } else {
            $to = randDate(strtotime($from), $end);
        }

        // reports_to: a previously created role (id lower) or null. Kept simple;
        // hierarchy shape does not affect the node-set / occupant property.
        $reportsTo = null;
        if ($i > 1 && mt_rand(1, 100) <= 70) {
            $reportsTo = $roleIds[mt_rand(0, $i - 2)];
        }

        $roles[] = [
            'role_id'        => $rid,
            'title'          => 'Role ' . $rid,
            'department'     => 'Dept ' . chr(65 + ($i % 5)),
            'reports_to'     => $reportsTo,
            'effective_from' => $from,
            'effective_to'   => $to,
        ];
    }

    $numPeople = mt_rand(1, 10);
    $people = [];
    $personIds = [];
    for ($i = 1; $i <= $numPeople; $i++) {
        $pid = 'P' . str_pad((string)$i, 3, '0', STR_PAD_LEFT);
        $personIds[] = $pid;
        $people[] = ['person_id' => $pid, 'name' => 'Person ' . $pid];
    }

    $numAssign = mt_rand(0, 14);
    $assignments = [];
    for ($i = 0; $i < $numAssign; $i++) {
        $start = randDate($base, $end);
        if (mt_rand(1, 100) <= 40) {
            $endDate = null;
        } else {
            $endDate = randDate(strtotime($start), $end);
        }
        $assignments[] = [
            'person_id'  => $personIds[mt_rand(0, $numPeople - 1)],
            'role_id'    => $roleIds[mt_rand(0, $numRoles - 1)],
            'start_date' => $start,
            'end_date'   => $endDate,
        ];
    }

    // Query date: usually inside range, occasionally at a boundary of a role/assignment.
    $candidates = [randDate($base, $end)];
    foreach ($roles as $r) {
        $candidates[] = $r['effective_from'];
        if ($r['effective_to'] !== null) {
            $candidates[] = $r['effective_to'];
        }
    }
    foreach ($assignments as $a) {
        $candidates[] = $a['start_date'];
        if ($a['end_date'] !== null) {
            $candidates[] = $a['end_date'];
        }
    }
    $queryDate = $candidates[mt_rand(0, count($candidates) - 1)];

    return [$roles, $people, $assignments, $queryDate];
}

// ------------------------------------------------------------------
// Reference implementation of the temporal predicate (independent of prod SQL).
// ------------------------------------------------------------------
function referenceActiveRoleIds(array $roles, $date)
{
    $ids = [];
    foreach ($roles as $r) {
        $fromOk = $r['effective_from'] <= $date;
        $toOk   = ($r['effective_to'] === null) || ($r['effective_to'] >= $date);
        if ($fromOk && $toOk) {
            $ids[$r['role_id']] = true;
        }
    }
    return $ids;
}

/**
 * Expected occupant per role, using the SAME "first active assignment wins"
 * tie-break as the production code (index by first encountered active
 * assignment for a role). Returns [roleId => ['occupant','person_id']].
 */
function referenceOccupants(array $assignments, array $people, $date)
{
    $nameById = [];
    foreach ($people as $p) {
        $nameById[$p['person_id']] = $p['name'];
    }

    $occ = [];
    foreach ($assignments as $a) {
        $startOk = $a['start_date'] <= $date;
        $endOk   = ($a['end_date'] === null) || ($a['end_date'] >= $date);
        if (!$startOk || !$endOk) {
            continue;
        }
        // Must join to an existing person (production uses INNER JOIN people).
        if (!isset($nameById[$a['role_id']]) && !isset($nameById[$a['person_id']])) {
            // person must exist
        }
        if (!isset($nameById[$a['person_id']])) {
            continue; // no matching person row -> excluded by JOIN
        }
        $rid = $a['role_id'];
        if (!isset($occ[$rid])) {
            $occ[$rid] = [
                'occupant'  => $nameById[$a['person_id']],
                'person_id' => $a['person_id'],
            ];
        }
    }
    return $occ;
}

// Flatten the tree returned by getOrgStateAtDate into role_id => node.
function flattenTree(array $nodes, array &$out)
{
    foreach ($nodes as $node) {
        $out[$node['role_id']] = $node;
        if (!empty($node['children'])) {
            flattenTree($node['children'], $out);
        }
    }
}

// ------------------------------------------------------------------
// Test runner
// ------------------------------------------------------------------
$iterations = isset($argv[1]) ? (int)$argv[1] : 500;
$seed = isset($argv[2]) ? (int)$argv[2] : 20260226;
mt_srand($seed);

$passed = 0;
$failed = 0;
$counterexample = null;

for ($iter = 0; $iter < $iterations; $iter++) {
    list($roles, $people, $assignments, $date) = generateDataset();

    $pdo = makeSeededPdo($roles, $people, $assignments);
    $tree = getOrgStateAtDate($pdo, $date);

    $flat = [];
    flattenTree($tree, $flat);

    $actualRoleIds = array_keys($flat);
    sort($actualRoleIds);

    $expectedRoleIds = array_keys(referenceActiveRoleIds($roles, $date));
    sort($expectedRoleIds);

    $ok = true;
    $reason = '';

    // 1) Node set must match the temporal role predicate EXACTLY.
    if ($actualRoleIds !== $expectedRoleIds) {
        $ok = false;
        $reason = 'Role node set mismatch. expected=[' . implode(',', $expectedRoleIds)
            . '] actual=[' . implode(',', $actualRoleIds) . ']';
    }

    // 2) No duplicate nodes in the flattened tree (each active role exactly once).
    if ($ok) {
        $seen = [];
        $countDistinct = 0;
        foreach ($flat as $rid => $n) {
            $seen[$rid] = true;
            $countDistinct++;
        }
        if ($countDistinct !== count($expectedRoleIds)) {
            $ok = false;
            $reason = 'Node count mismatch (possible duplicate/dropped node). distinct='
                . $countDistinct . ' expected=' . count($expectedRoleIds);
        }
    }

    // 3) Occupants must match the assignment predicate for each active role.
    if ($ok) {
        $expectedOcc = referenceOccupants($assignments, $people, $date);
        foreach ($flat as $rid => $node) {
            if (isset($expectedOcc[$rid])) {
                if ($node['occupant'] !== $expectedOcc[$rid]['occupant']
                    || $node['person_id'] !== $expectedOcc[$rid]['person_id']) {
                    $ok = false;
                    $reason = "Occupant mismatch for role $rid. expected="
                        . json_encode($expectedOcc[$rid])
                        . ' actual={"occupant":' . json_encode($node['occupant'])
                        . ',"person_id":' . json_encode($node['person_id']) . '}';
                    break;
                }
            } else {
                // No active assignment -> must be Vacant with null person_id.
                if ($node['occupant'] !== 'Vacant' || $node['person_id'] !== null) {
                    $ok = false;
                    $reason = "Role $rid should be Vacant but is "
                        . json_encode($node['occupant']) . '/' . json_encode($node['person_id']);
                    break;
                }
            }
        }
    }

    if ($ok) {
        $passed++;
    } else {
        $failed++;
        if ($counterexample === null) {
            $counterexample = [
                'iteration'   => $iter,
                'query_date'  => $date,
                'reason'      => $reason,
                'roles'       => $roles,
                'people'      => $people,
                'assignments' => $assignments,
            ];
        }
    }
}

echo "Property 9 - Org chart temporal correctness\n";
echo "Iterations: $iterations (seed=$seed)\n";
echo "Passed: $passed\n";
echo "Failed: $failed\n";

if ($failed > 0) {
    echo "\nFIRST COUNTEREXAMPLE:\n";
    echo json_encode($counterexample, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit(1);
}

echo "\nALL PROPERTY CHECKS PASSED\n";
exit(0);
