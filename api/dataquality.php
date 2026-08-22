<?php
/**
 * Data Quality API Endpoint - Weave Application
 * 
 * Provides CRUD operations for managing flagged records and data quality metrics.
 * 
 * Actions:
 *   GET  ?action=list                    - List flagged records with quality score
 *   GET  ?action=get&flag_id={id}        - Get a single flagged record
 *   GET  ?action=stats                   - Get summary statistics
 *   PUT  ?action=resolve&flag_id={id}    - Submit a resolution for a flagged record
 */

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/helpers.php';

// CORS headers for AJAX requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept GET and PUT requests
$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'PUT'])) {
    errorResponse('Method not allowed. Use GET or PUT.', 405);
}

// Require action parameter
$action = isset($_GET['action']) ? sanitizeInput($_GET['action']) : '';
if (empty($action)) {
    errorResponse('Missing required parameter: action', 400);
}

// Get database connection
$pdo = getConnection();

// Route to appropriate handler
switch ($action) {
    case 'list':
        handleList($pdo);
        break;

    case 'get':
        handleGet($pdo);
        break;

    case 'stats':
        handleStats($pdo);
        break;

    case 'resolve':
        handleResolve($pdo);
        break;

    default:
        errorResponse("Unknown action: '$action'. Valid actions are: list, get, stats, resolve.", 400);
}

// ============================================================
// Action Handlers
// ============================================================

/**
 * GET ?action=list - List all flagged records categorised by issue type with quality score.
 * 
 * Optional query params:
 *   ?issue_type=  - Filter by category (missing_field, unmatched_reference, date_conflict, duplicate)
 *   ?resolved=0|1 - Filter by resolution status
 *
 * @param PDO $pdo Database connection.
 * @return void
 */
function handleList($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('Method not allowed for list action. Use GET.', 405);
    }

    // Build query with optional filters
    $where = [];
    $params = [];

    // Filter by issue_type
    if (isset($_GET['issue_type']) && !empty($_GET['issue_type'])) {
        $issueType = sanitizeInput($_GET['issue_type']);
        $validTypes = ['missing_field', 'unmatched_reference', 'date_conflict', 'duplicate'];
        if (!in_array($issueType, $validTypes)) {
            errorResponse("Invalid issue_type. Valid values: " . implode(', ', $validTypes), 400);
        }
        $where[] = "issue_type = ?";
        $params[] = $issueType;
    }

    // Filter by resolved status
    if (isset($_GET['resolved']) && $_GET['resolved'] !== '') {
        $resolved = (int) $_GET['resolved'];
        if (!in_array($resolved, [0, 1])) {
            errorResponse("Invalid resolved value. Use 0 or 1.", 400);
        }
        $where[] = "resolved = ?";
        $params[] = $resolved;
    }

    $sql = "SELECT id, source_file, row_number, issue_type, issue_description, original_data, resolved, resolved_at, created_at FROM flagged_records";
    if (!empty($where)) {
        $sql .= " WHERE " . implode(' AND ', $where);
    }
    $sql .= " ORDER BY created_at DESC";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $flaggedRecords = $stmt->fetchAll();

        // Parse JSON original_data for each record
        foreach ($flaggedRecords as &$record) {
            $record['original_data'] = json_decode($record['original_data'], true);
            $record['resolved'] = (bool) $record['resolved'];
        }
        unset($record);

        // Calculate quality score
        $qualityScore = calculateQualityScore($pdo);

        // Get category counts (always show all categories regardless of filters)
        $categories = getCategoryCounts($pdo);

        jsonResponse([
            'success' => true,
            'quality_score' => $qualityScore,
            'flagged_records' => $flaggedRecords,
            'categories' => $categories
        ]);
    } catch (PDOException $e) {
        errorResponse('Database error while fetching flagged records.', 500);
    }
}

/**
 * GET ?action=get&flag_id={id} - Get a single flagged record's details.
 *
 * @param PDO $pdo Database connection.
 * @return void
 */
function handleGet($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('Method not allowed for get action. Use GET.', 405);
    }

    if (!isset($_GET['flag_id']) || $_GET['flag_id'] === '') {
        errorResponse('Missing required parameter: flag_id', 400);
    }

    $flagId = (int) $_GET['flag_id'];
    if ($flagId <= 0) {
        errorResponse('Invalid flag_id. Must be a positive integer.', 400);
    }

    try {
        $stmt = $pdo->prepare(
            "SELECT id, source_file, row_number, issue_type, issue_description, original_data, resolved, resolved_at, created_at 
             FROM flagged_records WHERE id = ?"
        );
        $stmt->execute([$flagId]);
        $record = $stmt->fetch();

        if (!$record) {
            errorResponse("Flagged record with id $flagId not found.", 404);
        }

        $record['original_data'] = json_decode($record['original_data'], true);
        $record['resolved'] = (bool) $record['resolved'];

        jsonResponse([
            'success' => true,
            'record' => $record
        ]);
    } catch (PDOException $e) {
        errorResponse('Database error while fetching flagged record.', 500);
    }
}

/**
 * GET ?action=stats - Get summary statistics for data quality.
 *
 * @param PDO $pdo Database connection.
 * @return void
 */
function handleStats($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('Method not allowed for stats action. Use GET.', 405);
    }

    try {
        $totalRecords = getTotalRecordCount($pdo);

        $flaggedStmt = $pdo->query("SELECT COUNT(*) as cnt FROM flagged_records");
        $flaggedCount = (int) $flaggedStmt->fetch()['cnt'];

        $resolvedStmt = $pdo->query("SELECT COUNT(*) as cnt FROM flagged_records WHERE resolved = TRUE");
        $resolvedCount = (int) $resolvedStmt->fetch()['cnt'];

        $unresolvedCount = $flaggedCount - $resolvedCount;

        $qualityScore = calculateQualityScore($pdo);

        jsonResponse([
            'success' => true,
            'total_records' => $totalRecords,
            'flagged_count' => $flaggedCount,
            'resolved_count' => $resolvedCount,
            'unresolved_count' => $unresolvedCount,
            'quality_score' => $qualityScore
        ]);
    } catch (PDOException $e) {
        errorResponse('Database error while fetching statistics.', 500);
    }
}

/**
 * PUT ?action=resolve&flag_id={id} - Submit a resolution for a flagged record.
 * 
 * Accepts JSON body with resolved_data object.
 * Re-validates the resolved data and updates the database if valid.
 *
 * @param PDO $pdo Database connection.
 * @return void
 */
function handleResolve($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
        errorResponse('Method not allowed for resolve action. Use PUT.', 405);
    }

    if (!isset($_GET['flag_id']) || $_GET['flag_id'] === '') {
        errorResponse('Missing required parameter: flag_id', 400);
    }

    $flagId = (int) $_GET['flag_id'];
    if ($flagId <= 0) {
        errorResponse('Invalid flag_id. Must be a positive integer.', 400);
    }

    // Read JSON body
    $rawBody = file_get_contents('php://input');
    $body = json_decode($rawBody, true);

    if ($body === null || !isset($body['resolved_data'])) {
        errorResponse('Invalid request body. Expected JSON with "resolved_data" object.', 400);
    }

    $resolvedData = $body['resolved_data'];

    // Fetch the flagged record
    try {
        $stmt = $pdo->prepare("SELECT * FROM flagged_records WHERE id = ?");
        $stmt->execute([$flagId]);
        $flaggedRecord = $stmt->fetch();
    } catch (PDOException $e) {
        errorResponse('Database error while fetching flagged record.', 500);
    }

    if (!$flaggedRecord) {
        errorResponse("Flagged record with id $flagId not found.", 404);
    }

    if ($flaggedRecord['resolved']) {
        errorResponse("Flagged record with id $flagId has already been resolved.", 400);
    }

    // Re-validate resolved data based on issue type
    $issueType = $flaggedRecord['issue_type'];
    $sourceFile = $flaggedRecord['source_file'];
    $validationResult = validateResolution($pdo, $resolvedData, $issueType, $sourceFile);

    if (!$validationResult['valid']) {
        jsonResponse([
            'success' => true,
            'validation_passed' => false,
            'errors' => $validationResult['errors'],
            'message' => 'Resolution failed validation. Please correct the issues and try again.'
        ]);
        return;
    }

    // Validation passed - insert corrected record and mark as resolved
    try {
        $pdo->beginTransaction();

        // Insert the corrected record into the appropriate table
        insertResolvedRecord($pdo, $resolvedData, $sourceFile);

        // Mark the flagged record as resolved
        $updateStmt = $pdo->prepare(
            "UPDATE flagged_records SET resolved = TRUE, resolved_at = NOW() WHERE id = ?"
        );
        $updateStmt->execute([$flagId]);

        $pdo->commit();

        jsonResponse([
            'success' => true,
            'validation_passed' => true,
            'message' => 'Record validated and stored successfully.'
        ]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        errorResponse('Database error while resolving record: ' . $e->getMessage(), 500);
    }
}

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validates resolved data based on the issue type and source file.
 *
 * @param PDO    $pdo          Database connection.
 * @param array  $resolvedData The resolved data submitted by the user.
 * @param string $issueType    The type of issue being resolved.
 * @param string $sourceFile   The source file the record came from.
 * @return array Associative array with 'valid' (bool) and 'errors' (array of strings).
 */
function validateResolution($pdo, $resolvedData, $issueType, $sourceFile) {
    $errors = [];

    switch ($issueType) {
        case 'missing_field':
            $errors = validateMissingFieldResolution($resolvedData, $sourceFile);
            break;

        case 'unmatched_reference':
            $errors = validateUnmatchedReferenceResolution($pdo, $resolvedData, $sourceFile);
            break;

        case 'date_conflict':
            $errors = validateDateConflictResolution($resolvedData, $sourceFile);
            break;

        case 'duplicate':
            // For duplicates, user confirms it's a duplicate - no additional validation needed
            break;

        default:
            $errors[] = "Unknown issue type: $issueType";
    }

    return [
        'valid' => empty($errors),
        'errors' => $errors
    ];
}

/**
 * Validates resolution for missing_field issues - checks all required fields are present.
 *
 * @param array  $resolvedData The resolved data.
 * @param string $sourceFile   The source file (e.g., 'roles.csv', 'people.csv', 'events.csv').
 * @return array Array of error strings (empty if valid).
 */
function validateMissingFieldResolution($resolvedData, $sourceFile) {
    $errors = [];
    $fileType = str_replace('.csv', '', $sourceFile);
    $requiredFields = getRequiredFieldsForFileType($fileType);

    foreach ($requiredFields as $field) {
        if (!isset($resolvedData[$field]) || trim($resolvedData[$field]) === '') {
            $errors[] = "Missing required field: $field";
        }
    }

    // Validate date fields if present
    $dateFields = getDateFieldsForFileType($fileType);
    foreach ($dateFields as $field) {
        if (isset($resolvedData[$field]) && trim($resolvedData[$field]) !== '') {
            if (!validateDate($resolvedData[$field])) {
                $errors[] = "Invalid date format for '$field': expected YYYY-MM-DD";
            }
        }
    }

    return $errors;
}

/**
 * Validates resolution for unmatched_reference issues - verifies referenced entity exists.
 *
 * @param PDO    $pdo          Database connection.
 * @param array  $resolvedData The resolved data.
 * @param string $sourceFile   The source file.
 * @return array Array of error strings (empty if valid).
 */
function validateUnmatchedReferenceResolution($pdo, $resolvedData, $sourceFile) {
    $errors = [];

    if ($sourceFile === 'people.csv') {
        // Check that the role_id references an existing role
        if (isset($resolvedData['role_id']) && trim($resolvedData['role_id']) !== '') {
            $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM roles WHERE role_id = ?");
            $stmt->execute([trim($resolvedData['role_id'])]);
            $count = (int) $stmt->fetch()['cnt'];

            if ($count === 0) {
                $errors[] = "Referenced role_id '{$resolvedData['role_id']}' does not exist in the roles table";
            }
        } else {
            $errors[] = "Missing required field: role_id";
        }

        // Also validate other required fields
        $requiredFields = ['person_id', 'name', 'role_id', 'start_date'];
        foreach ($requiredFields as $field) {
            if (!isset($resolvedData[$field]) || trim($resolvedData[$field]) === '') {
                if (!in_array("Missing required field: $field", $errors)) {
                    $errors[] = "Missing required field: $field";
                }
            }
        }
    } elseif ($sourceFile === 'events.csv') {
        // Check that entity_id references an existing entity
        if (isset($resolvedData['entity_type']) && isset($resolvedData['entity_id'])) {
            $entityType = strtolower(trim($resolvedData['entity_type']));
            $entityId = trim($resolvedData['entity_id']);

            if ($entityType === 'role') {
                $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM roles WHERE role_id = ?");
                $stmt->execute([$entityId]);
                $count = (int) $stmt->fetch()['cnt'];
                if ($count === 0) {
                    $errors[] = "Referenced entity_id '$entityId' does not exist in the roles table";
                }
            } elseif ($entityType === 'person') {
                $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM people WHERE person_id = ?");
                $stmt->execute([$entityId]);
                $count = (int) $stmt->fetch()['cnt'];
                if ($count === 0) {
                    $errors[] = "Referenced entity_id '$entityId' does not exist in the people table";
                }
            } else {
                $errors[] = "Invalid entity_type: must be 'role' or 'person'";
            }
        } else {
            if (!isset($resolvedData['entity_type']) || trim($resolvedData['entity_type']) === '') {
                $errors[] = "Missing required field: entity_type";
            }
            if (!isset($resolvedData['entity_id']) || trim($resolvedData['entity_id']) === '') {
                $errors[] = "Missing required field: entity_id";
            }
        }
    }

    return $errors;
}

/**
 * Validates resolution for date_conflict issues - verifies date logic.
 *
 * @param array  $resolvedData The resolved data.
 * @param string $sourceFile   The source file.
 * @return array Array of error strings (empty if valid).
 */
function validateDateConflictResolution($resolvedData, $sourceFile) {
    $errors = [];

    if ($sourceFile === 'roles.csv') {
        // Validate effective_from is present and valid
        if (!isset($resolvedData['effective_from']) || trim($resolvedData['effective_from']) === '') {
            $errors[] = "Missing required field: effective_from";
        } elseif (!validateDate($resolvedData['effective_from'])) {
            $errors[] = "Invalid date format for 'effective_from': expected YYYY-MM-DD";
        }

        // If effective_to is provided, validate format and ensure effective_from <= effective_to
        if (isset($resolvedData['effective_to']) && trim($resolvedData['effective_to']) !== '') {
            if (!validateDate($resolvedData['effective_to'])) {
                $errors[] = "Invalid date format for 'effective_to': expected YYYY-MM-DD";
            } elseif (isset($resolvedData['effective_from']) && validateDate($resolvedData['effective_from'])) {
                if ($resolvedData['effective_from'] > $resolvedData['effective_to']) {
                    $errors[] = "Date conflict: effective_from must be on or before effective_to";
                }
            }
        }
    } elseif ($sourceFile === 'people.csv') {
        // Validate start_date is present and valid
        if (!isset($resolvedData['start_date']) || trim($resolvedData['start_date']) === '') {
            $errors[] = "Missing required field: start_date";
        } elseif (!validateDate($resolvedData['start_date'])) {
            $errors[] = "Invalid date format for 'start_date': expected YYYY-MM-DD";
        }

        // If end_date is provided, validate format and ensure start_date <= end_date
        if (isset($resolvedData['end_date']) && trim($resolvedData['end_date']) !== '') {
            if (!validateDate($resolvedData['end_date'])) {
                $errors[] = "Invalid date format for 'end_date': expected YYYY-MM-DD";
            } elseif (isset($resolvedData['start_date']) && validateDate($resolvedData['start_date'])) {
                if ($resolvedData['start_date'] > $resolvedData['end_date']) {
                    $errors[] = "Date conflict: start_date must be on or before end_date";
                }
            }
        }
    } elseif ($sourceFile === 'events.csv') {
        // Validate effective_date is present and valid
        if (!isset($resolvedData['effective_date']) || trim($resolvedData['effective_date']) === '') {
            $errors[] = "Missing required field: effective_date";
        } elseif (!validateDate($resolvedData['effective_date'])) {
            $errors[] = "Invalid date format for 'effective_date': expected YYYY-MM-DD";
        }
    }

    return $errors;
}

// ============================================================
// Database Insertion Functions
// ============================================================

/**
 * Inserts a resolved record into the appropriate database table.
 *
 * @param PDO    $pdo          Database connection.
 * @param array  $resolvedData The resolved data to insert.
 * @param string $sourceFile   The source file determining which table to insert into.
 * @return void
 * @throws PDOException On database error.
 */
function insertResolvedRecord($pdo, $resolvedData, $sourceFile) {
    switch ($sourceFile) {
        case 'roles.csv':
            $effectiveTo = (isset($resolvedData['effective_to']) && trim($resolvedData['effective_to']) !== '')
                ? $resolvedData['effective_to'] : null;
            $reportsTo = (isset($resolvedData['reports_to']) && trim($resolvedData['reports_to']) !== '')
                ? $resolvedData['reports_to'] : null;

            $stmt = $pdo->prepare(
                "INSERT INTO roles (role_id, title, department, reports_to, effective_from, effective_to) 
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), department = VALUES(department), 
                 reports_to = VALUES(reports_to), effective_from = VALUES(effective_from), effective_to = VALUES(effective_to)"
            );
            $stmt->execute([
                trim($resolvedData['role_id']),
                trim($resolvedData['title']),
                trim($resolvedData['department']),
                $reportsTo,
                trim($resolvedData['effective_from']),
                $effectiveTo
            ]);
            break;

        case 'people.csv':
            $endDate = (isset($resolvedData['end_date']) && trim($resolvedData['end_date']) !== '')
                ? $resolvedData['end_date'] : null;

            // Insert or update person
            $personStmt = $pdo->prepare(
                "INSERT INTO people (person_id, name) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name)"
            );
            $personStmt->execute([
                trim($resolvedData['person_id']),
                trim($resolvedData['name'])
            ]);

            // Insert role assignment
            $assignStmt = $pdo->prepare(
                "INSERT INTO role_assignments (person_id, role_id, start_date, end_date) 
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE end_date = VALUES(end_date)"
            );
            $assignStmt->execute([
                trim($resolvedData['person_id']),
                trim($resolvedData['role_id']),
                trim($resolvedData['start_date']),
                $endDate
            ]);
            break;

        case 'events.csv':
            $previousValue = (isset($resolvedData['previous_value']) && trim($resolvedData['previous_value']) !== '')
                ? $resolvedData['previous_value'] : null;
            $newValue = (isset($resolvedData['new_value']) && trim($resolvedData['new_value']) !== '')
                ? $resolvedData['new_value'] : null;
            $description = (isset($resolvedData['description']) && trim($resolvedData['description']) !== '')
                ? $resolvedData['description'] : null;

            $stmt = $pdo->prepare(
                "INSERT INTO events (event_id, event_type, entity_type, entity_id, previous_value, new_value, effective_date, description) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE event_type = VALUES(event_type), entity_type = VALUES(entity_type),
                 entity_id = VALUES(entity_id), previous_value = VALUES(previous_value), new_value = VALUES(new_value),
                 effective_date = VALUES(effective_date), description = VALUES(description)"
            );
            $stmt->execute([
                trim($resolvedData['event_id']),
                strtolower(trim($resolvedData['event_type'])),
                strtolower(trim($resolvedData['entity_type'])),
                trim($resolvedData['entity_id']),
                $previousValue,
                $newValue,
                trim($resolvedData['effective_date']),
                $description
            ]);
            break;

        default:
            throw new \RuntimeException("Unknown source file: $sourceFile");
    }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Calculates the data quality score.
 * Formula: ((total_records - unresolved_flags) / total_records) * 100
 *
 * @param PDO $pdo Database connection.
 * @return float Quality score rounded to 1 decimal place (0.0 - 100.0).
 */
function calculateQualityScore($pdo) {
    $totalRecords = getTotalRecordCount($pdo);

    $flaggedStmt = $pdo->query("SELECT COUNT(*) as cnt FROM flagged_records WHERE resolved = FALSE");
    $flaggedCount = (int) $flaggedStmt->fetch()['cnt'];

    if ($totalRecords === 0) {
        return 100.0;
    }

    return round((($totalRecords - $flaggedCount) / $totalRecords) * 100, 1);
}

/**
 * Gets the total number of records across roles, people, and events tables.
 *
 * @param PDO $pdo Database connection.
 * @return int Total record count.
 */
function getTotalRecordCount($pdo) {
    $stmt = $pdo->query(
        "SELECT 
            (SELECT COUNT(*) FROM roles) + 
            (SELECT COUNT(*) FROM people) + 
            (SELECT COUNT(*) FROM events) AS total"
    );
    return (int) $stmt->fetch()['total'];
}

/**
 * Gets the count of flagged records per category (unresolved only).
 *
 * @param PDO $pdo Database connection.
 * @return array Associative array of issue_type => count.
 */
function getCategoryCounts($pdo) {
    $stmt = $pdo->query(
        "SELECT issue_type, COUNT(*) as cnt FROM flagged_records WHERE resolved = FALSE GROUP BY issue_type"
    );
    $rows = $stmt->fetchAll();

    // Initialise all categories to zero
    $categories = [
        'missing_field' => 0,
        'unmatched_reference' => 0,
        'date_conflict' => 0,
        'duplicate' => 0
    ];

    foreach ($rows as $row) {
        $categories[$row['issue_type']] = (int) $row['cnt'];
    }

    return $categories;
}

/**
 * Returns the required fields for a given file type (used in resolution validation).
 *
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Array of required field names.
 */
function getRequiredFieldsForFileType($fileType) {
    $fields = [
        'roles' => ['role_id', 'title', 'department', 'effective_from'],
        'people' => ['person_id', 'name', 'role_id', 'start_date'],
        'events' => ['event_id', 'event_type', 'entity_type', 'entity_id', 'effective_date']
    ];

    return isset($fields[$fileType]) ? $fields[$fileType] : [];
}

/**
 * Returns all date fields for a given file type (used in resolution validation).
 *
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Array of date field names.
 */
function getDateFieldsForFileType($fileType) {
    $fields = [
        'roles' => ['effective_from', 'effective_to'],
        'people' => ['start_date', 'end_date'],
        'events' => ['effective_date']
    ];

    return isset($fields[$fileType]) ? $fields[$fileType] : [];
}
