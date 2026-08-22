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

require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/validator.php';

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

// Route to appropriate handler
switch ($action) {
    case 'list':
        handleList();
        break;

    case 'get':
        handleGet();
        break;

    case 'stats':
        handleStats();
        break;

    case 'resolve':
        handleResolve();
        break;

    default:
        errorResponse("Unknown action: '$action'. Valid actions are: list, get, stats, resolve.", 400);
}

// ============================================================
// Action Handlers
// ============================================================

/**
 * GET ?action=list - List all flagged records categorised by issue type with quality score.
 */
function handleList() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('Method not allowed for list action. Use GET.', 405);
    }

    $flaggedRecords = storeRead('flagged_records');

    // Apply filters
    $issueTypeFilter = null;
    if (isset($_GET['issue_type']) && !empty($_GET['issue_type'])) {
        $issueType = sanitizeInput($_GET['issue_type']);
        $validTypes = ['missing_field', 'unmatched_reference', 'date_conflict', 'duplicate'];
        if (!in_array($issueType, $validTypes)) {
            errorResponse("Invalid issue_type. Valid values: " . implode(', ', $validTypes), 400);
        }
        $issueTypeFilter = $issueType;
    }

    $resolvedFilter = null;
    if (isset($_GET['resolved']) && $_GET['resolved'] !== '') {
        $resolved = (int) $_GET['resolved'];
        if (!in_array($resolved, [0, 1])) {
            errorResponse("Invalid resolved value. Use 0 or 1.", 400);
        }
        $resolvedFilter = (bool) $resolved;
    }

    // Filter records
    $filtered = array_filter($flaggedRecords, function ($record) use ($issueTypeFilter, $resolvedFilter) {
        if ($issueTypeFilter !== null && $record['issue_type'] !== $issueTypeFilter) {
            return false;
        }
        if ($resolvedFilter !== null && $record['resolved'] !== $resolvedFilter) {
            return false;
        }
        return true;
    });

    // Sort by created_at DESC (newest first)
    usort($filtered, function ($a, $b) {
        return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
    });

    $filtered = array_values($filtered);

    // Calculate quality score
    $qualityScore = calculateQualityScore();

    // Get category counts (always show all categories regardless of filters)
    $categories = getCategoryCounts();

    jsonResponse([
        'success'          => true,
        'quality_score'    => $qualityScore,
        'flagged_records'  => $filtered,
        'categories'       => $categories
    ]);
}

/**
 * GET ?action=get&flag_id={id} - Get a single flagged record's details.
 */
function handleGet() {
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

    $flaggedRecords = storeRead('flagged_records');

    // Find record by id
    $record = null;
    foreach ($flaggedRecords as $r) {
        if ($r['id'] === $flagId) {
            $record = $r;
            break;
        }
    }

    if (!$record) {
        errorResponse("Flagged record with id $flagId not found.", 404);
    }

    jsonResponse([
        'success' => true,
        'record'  => $record
    ]);
}

/**
 * GET ?action=stats - Get summary statistics for data quality.
 */
function handleStats() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('Method not allowed for stats action. Use GET.', 405);
    }

    $flaggedRecords = storeRead('flagged_records');
    $totalRecords = getTotalRecordCount();

    $flaggedCount = count($flaggedRecords);
    $resolvedCount = 0;
    foreach ($flaggedRecords as $r) {
        if ($r['resolved'] === true) {
            $resolvedCount++;
        }
    }
    $unresolvedCount = $flaggedCount - $resolvedCount;

    $qualityScore = calculateQualityScore();

    jsonResponse([
        'success'          => true,
        'total_records'    => $totalRecords,
        'flagged_count'    => $flaggedCount,
        'resolved_count'   => $resolvedCount,
        'unresolved_count' => $unresolvedCount,
        'quality_score'    => $qualityScore
    ]);
}

/**
 * PUT ?action=resolve&flag_id={id} - Submit a resolution for a flagged record.
 */
function handleResolve() {
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
    $flaggedRecords = storeRead('flagged_records');
    $flaggedRecord = null;
    $flagIndex = null;

    foreach ($flaggedRecords as $index => $r) {
        if ($r['id'] === $flagId) {
            $flaggedRecord = $r;
            $flagIndex = $index;
            break;
        }
    }

    if (!$flaggedRecord) {
        errorResponse("Flagged record with id $flagId not found.", 404);
    }

    if ($flaggedRecord['resolved'] === true) {
        errorResponse("Flagged record with id $flagId has already been resolved.", 400);
    }

    // Re-validate resolved data based on issue type
    $issueType = $flaggedRecord['issue_type'];
    $sourceFile = $flaggedRecord['source_file'];
    $validationResult = validateResolution($resolvedData, $issueType, $sourceFile);

    if (!$validationResult['valid']) {
        jsonResponse([
            'success'           => true,
            'validation_passed' => false,
            'errors'            => $validationResult['errors'],
            'message'           => 'Resolution failed validation. Please correct the issues and try again.'
        ]);
        return;
    }

    // Validation passed - insert corrected record and mark as resolved
    insertResolvedRecord($resolvedData, $sourceFile);

    // Mark the flagged record as resolved
    $flaggedRecords[$flagIndex]['resolved'] = true;
    $flaggedRecords[$flagIndex]['resolved_at'] = date('Y-m-d H:i:s');
    storeWrite('flagged_records', $flaggedRecords);

    jsonResponse([
        'success'           => true,
        'validation_passed' => true,
        'message'           => 'Record validated and stored successfully.'
    ]);
}

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validates resolved data based on the issue type and source file.
 */
function validateResolution($resolvedData, $issueType, $sourceFile) {
    $errors = [];

    switch ($issueType) {
        case 'missing_field':
            $errors = validateMissingFieldResolution($resolvedData, $sourceFile);
            break;

        case 'unmatched_reference':
            $errors = validateUnmatchedReferenceResolution($resolvedData, $sourceFile);
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
        'valid'  => empty($errors),
        'errors' => $errors
    ];
}

/**
 * Validates resolution for missing_field issues.
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
 * Validates resolution for unmatched_reference issues.
 */
function validateUnmatchedReferenceResolution($resolvedData, $sourceFile) {
    $errors = [];

    if ($sourceFile === 'people.csv') {
        // Check that the role_id references an existing role
        if (isset($resolvedData['role_id']) && trim($resolvedData['role_id']) !== '') {
            $roles = storeRead('roles');
            $roleIds = array_column($roles, 'role_id');
            if (!in_array(trim($resolvedData['role_id']), $roleIds)) {
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
                $roles = storeRead('roles');
                $roleIds = array_column($roles, 'role_id');
                if (!in_array($entityId, $roleIds)) {
                    $errors[] = "Referenced entity_id '$entityId' does not exist in the roles table";
                }
            } elseif ($entityType === 'person') {
                $people = storeRead('people');
                $personIds = array_column($people, 'person_id');
                if (!in_array($entityId, $personIds)) {
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
 * Validates resolution for date_conflict issues.
 */
function validateDateConflictResolution($resolvedData, $sourceFile) {
    $errors = [];

    if ($sourceFile === 'roles.csv') {
        if (!isset($resolvedData['effective_from']) || trim($resolvedData['effective_from']) === '') {
            $errors[] = "Missing required field: effective_from";
        } elseif (!validateDate($resolvedData['effective_from'])) {
            $errors[] = "Invalid date format for 'effective_from': expected YYYY-MM-DD";
        }

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
        if (!isset($resolvedData['start_date']) || trim($resolvedData['start_date']) === '') {
            $errors[] = "Missing required field: start_date";
        } elseif (!validateDate($resolvedData['start_date'])) {
            $errors[] = "Invalid date format for 'start_date': expected YYYY-MM-DD";
        }

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
 * Inserts a resolved record into the appropriate JSON store.
 */
function insertResolvedRecord($resolvedData, $sourceFile) {
    switch ($sourceFile) {
        case 'roles.csv':
            $roles = storeRead('roles');
            $effectiveTo = (isset($resolvedData['effective_to']) && trim($resolvedData['effective_to']) !== '')
                ? $resolvedData['effective_to'] : null;
            $reportsTo = (isset($resolvedData['reports_to']) && trim($resolvedData['reports_to']) !== '')
                ? $resolvedData['reports_to'] : null;

            $newRole = [
                'role_id'        => trim($resolvedData['role_id']),
                'title'          => trim($resolvedData['title']),
                'department'     => trim($resolvedData['department']),
                'reports_to'     => $reportsTo,
                'effective_from' => trim($resolvedData['effective_from']),
                'effective_to'   => $effectiveTo
            ];

            // Update existing or insert new (ON DUPLICATE KEY UPDATE equivalent)
            $found = false;
            foreach ($roles as &$r) {
                if ($r['role_id'] === $newRole['role_id']) {
                    $r = $newRole;
                    $found = true;
                    break;
                }
            }
            unset($r);

            if (!$found) {
                $roles[] = $newRole;
            }

            storeWrite('roles', $roles);
            break;

        case 'people.csv':
            $people = storeRead('people');
            $assignments = storeRead('role_assignments');

            $endDate = (isset($resolvedData['end_date']) && trim($resolvedData['end_date']) !== '')
                ? $resolvedData['end_date'] : null;

            // Insert or update person
            $personFound = false;
            foreach ($people as &$p) {
                if ($p['person_id'] === trim($resolvedData['person_id'])) {
                    $p['name'] = trim($resolvedData['name']);
                    $personFound = true;
                    break;
                }
            }
            unset($p);

            if (!$personFound) {
                $people[] = [
                    'person_id' => trim($resolvedData['person_id']),
                    'name'      => trim($resolvedData['name'])
                ];
            }

            // Insert or update role assignment
            $assignmentFound = false;
            foreach ($assignments as &$a) {
                if ($a['person_id'] === trim($resolvedData['person_id']) && $a['role_id'] === trim($resolvedData['role_id'])) {
                    $a['end_date'] = $endDate;
                    $assignmentFound = true;
                    break;
                }
            }
            unset($a);

            if (!$assignmentFound) {
                $assignments[] = [
                    'person_id'  => trim($resolvedData['person_id']),
                    'role_id'    => trim($resolvedData['role_id']),
                    'start_date' => trim($resolvedData['start_date']),
                    'end_date'   => $endDate
                ];
            }

            storeWrite('people', $people);
            storeWrite('role_assignments', $assignments);
            break;

        case 'events.csv':
            $events = storeRead('events');

            $previousValue = (isset($resolvedData['previous_value']) && trim($resolvedData['previous_value']) !== '')
                ? $resolvedData['previous_value'] : null;
            $newValue = (isset($resolvedData['new_value']) && trim($resolvedData['new_value']) !== '')
                ? $resolvedData['new_value'] : null;
            $description = (isset($resolvedData['description']) && trim($resolvedData['description']) !== '')
                ? $resolvedData['description'] : null;

            $newEvent = [
                'event_id'       => trim($resolvedData['event_id']),
                'event_type'     => strtolower(trim($resolvedData['event_type'])),
                'entity_type'    => strtolower(trim($resolvedData['entity_type'])),
                'entity_id'      => trim($resolvedData['entity_id']),
                'previous_value' => $previousValue,
                'new_value'      => $newValue,
                'effective_date' => trim($resolvedData['effective_date']),
                'description'    => $description
            ];

            // Update existing or insert new
            $found = false;
            foreach ($events as &$e) {
                if ($e['event_id'] === $newEvent['event_id']) {
                    $e = $newEvent;
                    $found = true;
                    break;
                }
            }
            unset($e);

            if (!$found) {
                $events[] = $newEvent;
            }

            storeWrite('events', $events);
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
 */
function calculateQualityScore() {
    $totalRecords = getTotalRecordCount();
    $flaggedRecords = storeRead('flagged_records');

    $unresolvedCount = 0;
    foreach ($flaggedRecords as $r) {
        if ($r['resolved'] === false) {
            $unresolvedCount++;
        }
    }

    if ($totalRecords === 0) {
        return 100.0;
    }

    return round((($totalRecords - $unresolvedCount) / $totalRecords) * 100, 1);
}

/**
 * Gets the total number of records across all stores.
 */
function getTotalRecordCount() {
    $roles = storeRead('roles');
    $people = storeRead('people');
    $events = storeRead('events');

    return count($roles) + count($people) + count($events);
}

/**
 * Gets the count of flagged records per category (unresolved only).
 */
function getCategoryCounts() {
    $flaggedRecords = storeRead('flagged_records');

    $categories = [
        'missing_field'       => 0,
        'unmatched_reference' => 0,
        'date_conflict'       => 0,
        'duplicate'           => 0
    ];

    foreach ($flaggedRecords as $r) {
        if ($r['resolved'] === false && isset($categories[$r['issue_type']])) {
            $categories[$r['issue_type']]++;
        }
    }

    return $categories;
}

/**
 * Returns the required fields for a given file type (used in resolution validation).
 */
function getRequiredFieldsForFileType($fileType) {
    $fields = [
        'roles'  => ['role_id', 'title', 'department', 'effective_from'],
        'people' => ['person_id', 'name', 'role_id', 'start_date'],
        'events' => ['event_id', 'event_type', 'entity_type', 'entity_id', 'effective_date']
    ];

    return isset($fields[$fileType]) ? $fields[$fileType] : [];
}

/**
 * Returns all date fields for a given file type (used in resolution validation).
 */
function getDateFieldsForFileType($fileType) {
    $fields = [
        'roles'  => ['effective_from', 'effective_to'],
        'people' => ['start_date', 'end_date'],
        'events' => ['effective_date']
    ];

    return isset($fields[$fileType]) ? $fields[$fileType] : [];
}
