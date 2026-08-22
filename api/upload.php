<?php
/**
 * CSV Upload API Endpoint - Weave Application
 * 
 * Handles multipart form POST uploads for roles_csv, people_csv, and events_csv.
 * Validates files, parses CSV content, stores valid records in MySQL,
 * flags invalid rows into the flagged_records table, and returns a JSON summary.
 */

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/csv-parser.php';
require_once __DIR__ . '/includes/validator.php';
require_once __DIR__ . '/includes/helpers.php';

// CORS headers for frontend access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed. Use POST.', 405);
}

// Maximum file size: 10MB
define('MAX_FILE_SIZE', 10 * 1024 * 1024);

// Allowed MIME types for CSV
$allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];

// File field names to process
$fileFields = ['roles_csv', 'people_csv', 'events_csv'];

// Check that at least one file is uploaded
$hasFile = false;
foreach ($fileFields as $field) {
    if (isset($_FILES[$field]) && $_FILES[$field]['error'] !== UPLOAD_ERR_NO_FILE) {
        $hasFile = true;
        break;
    }
}

if (!$hasFile) {
    errorResponse('No file uploaded. Please upload at least one CSV file (roles_csv, people_csv, or events_csv).', 400);
}

// Summary counters
$summary = [
    'roles_imported' => 0,
    'people_imported' => 0,
    'events_imported' => 0,
    'flagged' => 0
];

$errors = [];

// Get database connection
$pdo = getConnection();

// Process each file field
foreach ($fileFields as $field) {
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        continue;
    }

    $file = $_FILES[$field];

    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors[] = "Upload error for $field: " . getUploadErrorMessage($file['error']);
        continue;
    }

    // Validate file extension
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($extension !== 'csv') {
        errorResponse("Only CSV files accepted. File '$field' has extension '.$extension'.", 400);
    }

    // Validate MIME type
    $mimeType = $file['type'];
    if (!in_array($mimeType, $allowedMimeTypes)) {
        // Also check with finfo for more reliable detection
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($detectedMime, $allowedMimeTypes)) {
            errorResponse("Only CSV files accepted. File '$field' has MIME type '$detectedMime'.", 400);
        }
    }

    // Validate file size
    if ($file['size'] > MAX_FILE_SIZE) {
        errorResponse("File exceeds size limit. Maximum allowed size is 10MB.", 400);
    }

    // Determine file type from field name
    $fileType = str_replace('_csv', '', $field); // roles, people, or events

    // Parse CSV file
    $parseResult = parseCSVFile($file['tmp_name'], $fileType);

    if (!$parseResult['valid']) {
        // Return parsing errors (e.g., missing headers)
        errorResponse(implode('; ', $parseResult['errors']), 400);
    }

    // Process rows based on file type
    switch ($fileType) {
        case 'roles':
            $result = processRolesFile($pdo, $parseResult['rows'], $summary, $fileType);
            $summary = $result;
            break;

        case 'people':
            $result = processPeopleFile($pdo, $parseResult['rows'], $summary, $fileType);
            $summary = $result;
            break;

        case 'events':
            $result = processEventsFile($pdo, $parseResult['rows'], $summary, $fileType);
            $summary = $result;
            break;
    }
}

// Perform cross-file reference matching after all files are processed
performCrossFileMatching($pdo, $summary);

// Return success response with summary
jsonResponse([
    'success' => true,
    'summary' => $summary
]);

// ============================================================
// Processing Functions
// ============================================================

/**
 * Processes roles CSV rows: validates, inserts valid records, flags invalid ones.
 *
 * @param PDO   $pdo      Database connection.
 * @param array $rows     Parsed CSV rows.
 * @param array $summary  Current summary counts.
 * @param string $fileType The file type identifier.
 * @return array Updated summary counts.
 */
function processRolesFile($pdo, $rows, $summary, $fileType) {
    $pdo->beginTransaction();

    try {
        $insertStmt = $pdo->prepare(
            "INSERT IGNORE INTO roles (role_id, title, department, reports_to, effective_from, effective_to) 
             VALUES (?, ?, ?, ?, ?, ?)"
        );

        $flagStmt = $pdo->prepare(
            "INSERT INTO flagged_records (source_file, row_number, issue_type, issue_description, original_data) 
             VALUES (?, ?, ?, ?, ?)"
        );

        foreach ($rows as $row) {
            $rowNumber = $row['_row_number'];
            $validation = validateRow($row, 'roles', $rowNumber);

            if ($validation['valid']) {
                $effectiveTo = (!empty(trim($row['effective_to'] ?? ''))) ? $row['effective_to'] : null;
                $reportsTo = (!empty(trim($row['reports_to'] ?? ''))) ? $row['reports_to'] : null;

                $insertStmt->execute([
                    $row['role_id'],
                    $row['title'],
                    $row['department'],
                    $reportsTo,
                    $row['effective_from'],
                    $effectiveTo
                ]);

                if ($insertStmt->rowCount() > 0) {
                    $summary['roles_imported']++;
                }
            } else {
                // Flag the invalid row
                $issueType = determineIssueType($validation['errors']);
                $issueDescription = implode('; ', $validation['errors']);
                $originalData = json_encode(array_filter($row, function($key) {
                    return $key !== '_row_number';
                }, ARRAY_FILTER_USE_KEY));

                $flagStmt->execute([
                    'roles.csv',
                    $rowNumber,
                    $issueType,
                    $issueDescription,
                    $originalData
                ]);

                $summary['flagged']++;
            }
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Database error while processing roles: ' . $e->getMessage(), 500);
    }

    return $summary;
}

/**
 * Processes people CSV rows: validates, inserts valid records into people and role_assignments,
 * flags invalid ones.
 *
 * @param PDO   $pdo      Database connection.
 * @param array $rows     Parsed CSV rows.
 * @param array $summary  Current summary counts.
 * @param string $fileType The file type identifier.
 * @return array Updated summary counts.
 */
function processPeopleFile($pdo, $rows, $summary, $fileType) {
    $pdo->beginTransaction();

    try {
        $insertPersonStmt = $pdo->prepare(
            "INSERT IGNORE INTO people (person_id, name) VALUES (?, ?)"
        );

        $insertAssignmentStmt = $pdo->prepare(
            "INSERT IGNORE INTO role_assignments (person_id, role_id, start_date, end_date) 
             VALUES (?, ?, ?, ?)"
        );

        $flagStmt = $pdo->prepare(
            "INSERT INTO flagged_records (source_file, row_number, issue_type, issue_description, original_data) 
             VALUES (?, ?, ?, ?, ?)"
        );

        foreach ($rows as $row) {
            $rowNumber = $row['_row_number'];
            $validation = validateRow($row, 'people', $rowNumber);

            if ($validation['valid']) {
                $endDate = (!empty(trim($row['end_date'] ?? ''))) ? $row['end_date'] : null;

                // Insert person
                $insertPersonStmt->execute([
                    $row['person_id'],
                    $row['name']
                ]);

                // Insert role assignment
                $insertAssignmentStmt->execute([
                    $row['person_id'],
                    $row['role_id'],
                    $row['start_date'],
                    $endDate
                ]);

                if ($insertPersonStmt->rowCount() > 0 || $insertAssignmentStmt->rowCount() > 0) {
                    $summary['people_imported']++;
                }
            } else {
                // Flag the invalid row
                $issueType = determineIssueType($validation['errors']);
                $issueDescription = implode('; ', $validation['errors']);
                $originalData = json_encode(array_filter($row, function($key) {
                    return $key !== '_row_number';
                }, ARRAY_FILTER_USE_KEY));

                $flagStmt->execute([
                    'people.csv',
                    $rowNumber,
                    $issueType,
                    $issueDescription,
                    $originalData
                ]);

                $summary['flagged']++;
            }
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Database error while processing people: ' . $e->getMessage(), 500);
    }

    return $summary;
}

/**
 * Processes events CSV rows: validates, inserts valid records, flags invalid ones.
 *
 * @param PDO   $pdo      Database connection.
 * @param array $rows     Parsed CSV rows.
 * @param array $summary  Current summary counts.
 * @param string $fileType The file type identifier.
 * @return array Updated summary counts.
 */
function processEventsFile($pdo, $rows, $summary, $fileType) {
    $pdo->beginTransaction();

    try {
        $insertStmt = $pdo->prepare(
            "INSERT IGNORE INTO events (event_id, event_type, entity_type, entity_id, previous_value, new_value, effective_date, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );

        $flagStmt = $pdo->prepare(
            "INSERT INTO flagged_records (source_file, row_number, issue_type, issue_description, original_data) 
             VALUES (?, ?, ?, ?, ?)"
        );

        foreach ($rows as $row) {
            $rowNumber = $row['_row_number'];
            $validation = validateRow($row, 'events', $rowNumber);

            if ($validation['valid']) {
                $previousValue = (!empty(trim($row['previous_value'] ?? ''))) ? $row['previous_value'] : null;
                $newValue = (!empty(trim($row['new_value'] ?? ''))) ? $row['new_value'] : null;
                $description = (!empty(trim($row['description'] ?? ''))) ? $row['description'] : null;

                $insertStmt->execute([
                    $row['event_id'],
                    strtolower(trim($row['event_type'])),
                    strtolower(trim($row['entity_type'])),
                    $row['entity_id'],
                    $previousValue,
                    $newValue,
                    $row['effective_date'],
                    $description
                ]);

                if ($insertStmt->rowCount() > 0) {
                    $summary['events_imported']++;
                }
            } else {
                // Flag the invalid row
                $issueType = determineIssueType($validation['errors']);
                $issueDescription = implode('; ', $validation['errors']);
                $originalData = json_encode(array_filter($row, function($key) {
                    return $key !== '_row_number';
                }, ARRAY_FILTER_USE_KEY));

                $flagStmt->execute([
                    'events.csv',
                    $rowNumber,
                    $issueType,
                    $issueDescription,
                    $originalData
                ]);

                $summary['flagged']++;
            }
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        errorResponse('Database error while processing events: ' . $e->getMessage(), 500);
    }

    return $summary;
}

// ============================================================
// Cross-File Record Matching
// ============================================================

/**
 * Performs cross-file reference matching after all files have been processed.
 * Checks that person role_id references exist in roles, and event entity_ids
 * exist in corresponding entity tables. Flags unmatched references.
 *
 * @param PDO   $pdo     Database connection.
 * @param array &$summary Summary counts (passed by reference to increment flagged count).
 * @return void
 */
function performCrossFileMatching($pdo, &$summary) {
    try {
        // 1. Check people whose role_id does not exist in the roles table
        $unmatchedPeopleStmt = $pdo->query(
            "SELECT ra.person_id, ra.role_id, ra.start_date, p.name 
             FROM role_assignments ra
             JOIN people p ON p.person_id = ra.person_id
             LEFT JOIN roles r ON r.role_id = ra.role_id
             WHERE r.role_id IS NULL"
        );

        $flagStmt = $pdo->prepare(
            "INSERT INTO flagged_records (source_file, row_number, issue_type, issue_description, original_data) 
             VALUES (?, ?, 'unmatched_reference', ?, ?)"
        );

        $unmatchedPeople = $unmatchedPeopleStmt->fetchAll();
        foreach ($unmatchedPeople as $index => $row) {
            $issueDescription = "role_id '{$row['role_id']}' not found in roles";
            $originalData = json_encode([
                'person_id' => $row['person_id'],
                'name' => $row['name'],
                'role_id' => $row['role_id']
            ]);

            $flagStmt->execute([
                'people.csv',
                0, // row_number unknown for cross-file checks
                $issueDescription,
                $originalData
            ]);

            $summary['flagged']++;
        }

        // 2. Check events whose entity_id does not exist in the corresponding entity table
        $unmatchedEventsStmt = $pdo->query(
            "SELECT e.event_id, e.entity_type, e.entity_id, e.event_type
             FROM events e
             LEFT JOIN roles r ON e.entity_type = 'role' AND e.entity_id = r.role_id
             LEFT JOIN people p ON e.entity_type = 'person' AND e.entity_id = p.person_id
             WHERE (e.entity_type = 'role' AND r.role_id IS NULL)
                OR (e.entity_type = 'person' AND p.person_id IS NULL)"
        );

        $unmatchedEvents = $unmatchedEventsStmt->fetchAll();
        foreach ($unmatchedEvents as $index => $row) {
            $entityTable = $row['entity_type'] === 'role' ? 'roles' : 'people';
            $issueDescription = "entity_id '{$row['entity_id']}' not found in {$entityTable}";
            $originalData = json_encode([
                'event_id' => $row['event_id'],
                'entity_type' => $row['entity_type'],
                'entity_id' => $row['entity_id']
            ]);

            $flagStmt->execute([
                'events.csv',
                0, // row_number unknown for cross-file checks
                $issueDescription,
                $originalData
            ]);

            $summary['flagged']++;
        }

    } catch (Exception $e) {
        // Cross-file matching errors are non-fatal; log but don't halt the response
        error_log('Cross-file matching error: ' . $e->getMessage());
    }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Determines the issue_type ENUM value based on validation error messages.
 *
 * @param array $errors Array of error message strings.
 * @return string One of 'missing_field', 'date_conflict', 'unmatched_reference', 'duplicate'.
 */
function determineIssueType($errors) {
    $errorStr = implode(' ', $errors);

    if (stripos($errorStr, 'Missing required field') !== false) {
        return 'missing_field';
    }

    if (stripos($errorStr, 'Invalid date') !== false) {
        return 'date_conflict';
    }

    if (stripos($errorStr, 'unmatched') !== false || stripos($errorStr, 'not found') !== false) {
        return 'unmatched_reference';
    }

    if (stripos($errorStr, 'duplicate') !== false) {
        return 'duplicate';
    }

    // Default to missing_field for any other validation error
    return 'missing_field';
}

/**
 * Returns a human-readable message for PHP file upload error codes.
 *
 * @param int $errorCode The PHP upload error code.
 * @return string Human-readable error message.
 */
function getUploadErrorMessage($errorCode) {
    $messages = [
        UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload size limit',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds form upload size limit',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Server missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
        UPLOAD_ERR_EXTENSION  => 'Upload stopped by a PHP extension',
    ];

    return isset($messages[$errorCode]) ? $messages[$errorCode] : 'Unknown upload error';
}
