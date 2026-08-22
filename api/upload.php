<?php
/**
 * CSV Upload API Endpoint - Weave Application
 * 
 * Handles multipart form POST uploads for roles_csv, people_csv, and events_csv.
 * Validates files, parses CSV content, stores valid records in JSON files,
 * flags invalid rows into flagged_records.json, and returns a JSON summary.
 */

require_once __DIR__ . '/includes/store.php';
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
        errorResponse(implode('; ', $parseResult['errors']), 400);
    }

    // Process rows based on file type
    switch ($fileType) {
        case 'roles':
            $summary = processRolesFile($parseResult['rows'], $summary, $fileType);
            break;

        case 'people':
            $summary = processPeopleFile($parseResult['rows'], $summary, $fileType);
            break;

        case 'events':
            $summary = processEventsFile($parseResult['rows'], $summary, $fileType);
            break;
    }
}

// Perform cross-file reference matching after all files are processed
performCrossFileMatching($summary);

// Return success response with summary
jsonResponse([
    'success' => true,
    'summary' => $summary
]);

// ============================================================
// Processing Functions
// ============================================================

/**
 * Processes roles CSV rows: validates, appends valid records, flags invalid ones.
 */
function processRolesFile($rows, $summary, $fileType) {
    $roles = storeRead('roles');
    $existingIds = array_column($roles, 'role_id');

    foreach ($rows as $row) {
        $rowNumber = $row['_row_number'];
        $validation = validateRow($row, 'roles', $rowNumber);

        if ($validation['valid']) {
            // Skip duplicates (INSERT IGNORE equivalent)
            if (in_array($row['role_id'], $existingIds)) {
                continue;
            }

            $effectiveTo = (!empty(trim($row['effective_to'] ?? ''))) ? $row['effective_to'] : null;
            $reportsTo = (!empty(trim($row['reports_to'] ?? ''))) ? $row['reports_to'] : null;

            $roles[] = [
                'role_id'        => $row['role_id'],
                'title'          => $row['title'],
                'department'     => $row['department'],
                'reports_to'     => $reportsTo,
                'effective_from' => $row['effective_from'],
                'effective_to'   => $effectiveTo
            ];
            $existingIds[] = $row['role_id'];
            $summary['roles_imported']++;
        } else {
            // Flag the invalid row
            $issueType = determineIssueType($validation['errors']);
            $issueDescription = implode('; ', $validation['errors']);
            $originalData = array_filter($row, function($key) {
                return $key !== '_row_number';
            }, ARRAY_FILTER_USE_KEY);

            storeAppend('flagged_records', [
                'source_file'       => 'roles.csv',
                'row_number'        => $rowNumber,
                'issue_type'        => $issueType,
                'issue_description' => $issueDescription,
                'original_data'     => $originalData,
                'resolved'          => false,
                'resolved_at'       => null,
                'created_at'        => date('Y-m-d H:i:s')
            ]);

            $summary['flagged']++;
        }
    }

    storeWrite('roles', $roles);
    return $summary;
}

/**
 * Processes people CSV rows: validates, appends valid records to people and role_assignments,
 * flags invalid ones.
 */
function processPeopleFile($rows, $summary, $fileType) {
    $people = storeRead('people');
    $assignments = storeRead('role_assignments');
    $existingPersonIds = array_column($people, 'person_id');

    foreach ($rows as $row) {
        $rowNumber = $row['_row_number'];
        $validation = validateRow($row, 'people', $rowNumber);

        if ($validation['valid']) {
            $endDate = (!empty(trim($row['end_date'] ?? ''))) ? $row['end_date'] : null;
            $imported = false;

            // Insert person if not exists
            if (!in_array($row['person_id'], $existingPersonIds)) {
                $people[] = [
                    'person_id' => $row['person_id'],
                    'name'      => $row['name']
                ];
                $existingPersonIds[] = $row['person_id'];
                $imported = true;
            }

            // Check for duplicate assignment
            $assignmentExists = false;
            foreach ($assignments as $a) {
                if ($a['person_id'] === $row['person_id'] && $a['role_id'] === $row['role_id'] && $a['start_date'] === $row['start_date']) {
                    $assignmentExists = true;
                    break;
                }
            }

            if (!$assignmentExists) {
                $assignments[] = [
                    'person_id'  => $row['person_id'],
                    'role_id'    => $row['role_id'],
                    'start_date' => $row['start_date'],
                    'end_date'   => $endDate
                ];
                $imported = true;
            }

            if ($imported) {
                $summary['people_imported']++;
            }
        } else {
            // Flag the invalid row
            $issueType = determineIssueType($validation['errors']);
            $issueDescription = implode('; ', $validation['errors']);
            $originalData = array_filter($row, function($key) {
                return $key !== '_row_number';
            }, ARRAY_FILTER_USE_KEY);

            storeAppend('flagged_records', [
                'source_file'       => 'people.csv',
                'row_number'        => $rowNumber,
                'issue_type'        => $issueType,
                'issue_description' => $issueDescription,
                'original_data'     => $originalData,
                'resolved'          => false,
                'resolved_at'       => null,
                'created_at'        => date('Y-m-d H:i:s')
            ]);

            $summary['flagged']++;
        }
    }

    storeWrite('people', $people);
    storeWrite('role_assignments', $assignments);
    return $summary;
}

/**
 * Processes events CSV rows: validates, appends valid records, flags invalid ones.
 */
function processEventsFile($rows, $summary, $fileType) {
    $events = storeRead('events');
    $existingIds = array_column($events, 'event_id');

    foreach ($rows as $row) {
        $rowNumber = $row['_row_number'];
        $validation = validateRow($row, 'events', $rowNumber);

        if ($validation['valid']) {
            // Skip duplicates
            if (in_array($row['event_id'], $existingIds)) {
                continue;
            }

            $previousValue = (!empty(trim($row['previous_value'] ?? ''))) ? $row['previous_value'] : null;
            $newValue = (!empty(trim($row['new_value'] ?? ''))) ? $row['new_value'] : null;
            $description = (!empty(trim($row['description'] ?? ''))) ? $row['description'] : null;

            $events[] = [
                'event_id'       => $row['event_id'],
                'event_type'     => strtolower(trim($row['event_type'])),
                'entity_type'    => strtolower(trim($row['entity_type'])),
                'entity_id'      => $row['entity_id'],
                'previous_value' => $previousValue,
                'new_value'      => $newValue,
                'effective_date' => $row['effective_date'],
                'description'    => $description
            ];
            $existingIds[] = $row['event_id'];
            $summary['events_imported']++;
        } else {
            // Flag the invalid row
            $issueType = determineIssueType($validation['errors']);
            $issueDescription = implode('; ', $validation['errors']);
            $originalData = array_filter($row, function($key) {
                return $key !== '_row_number';
            }, ARRAY_FILTER_USE_KEY);

            storeAppend('flagged_records', [
                'source_file'       => 'events.csv',
                'row_number'        => $rowNumber,
                'issue_type'        => $issueType,
                'issue_description' => $issueDescription,
                'original_data'     => $originalData,
                'resolved'          => false,
                'resolved_at'       => null,
                'created_at'        => date('Y-m-d H:i:s')
            ]);

            $summary['flagged']++;
        }
    }

    storeWrite('events', $events);
    return $summary;
}

// ============================================================
// Cross-File Record Matching
// ============================================================

/**
 * Performs cross-file reference matching after all files have been processed.
 * Checks that person role_id references exist in roles, and event entity_ids
 * exist in corresponding entity tables. Flags unmatched references.
 */
function performCrossFileMatching(&$summary) {
    $roles = storeRead('roles');
    $people = storeRead('people');
    $assignments = storeRead('role_assignments');
    $events = storeRead('events');

    $roleIds = array_column($roles, 'role_id');
    $personIds = array_column($people, 'person_id');

    // 1. Check people whose role_id does not exist in the roles table
    foreach ($assignments as $assignment) {
        if (!in_array($assignment['role_id'], $roleIds)) {
            // Find the person name
            $personName = '';
            foreach ($people as $p) {
                if ($p['person_id'] === $assignment['person_id']) {
                    $personName = $p['name'];
                    break;
                }
            }

            $issueDescription = "role_id '{$assignment['role_id']}' not found in roles";
            $originalData = [
                'person_id' => $assignment['person_id'],
                'name'      => $personName,
                'role_id'   => $assignment['role_id']
            ];

            storeAppend('flagged_records', [
                'source_file'       => 'people.csv',
                'row_number'        => 0,
                'issue_type'        => 'unmatched_reference',
                'issue_description' => $issueDescription,
                'original_data'     => $originalData,
                'resolved'          => false,
                'resolved_at'       => null,
                'created_at'        => date('Y-m-d H:i:s')
            ]);

            $summary['flagged']++;
        }
    }

    // 2. Check events whose entity_id does not exist in the corresponding entity table
    foreach ($events as $event) {
        $entityType = $event['entity_type'];
        $entityId = $event['entity_id'];
        $unmatched = false;

        if ($entityType === 'role' && !in_array($entityId, $roleIds)) {
            $unmatched = true;
            $entityTable = 'roles';
        } elseif ($entityType === 'person' && !in_array($entityId, $personIds)) {
            $unmatched = true;
            $entityTable = 'people';
        }

        if ($unmatched) {
            $issueDescription = "entity_id '$entityId' not found in $entityTable";
            $originalData = [
                'event_id'    => $event['event_id'],
                'entity_type' => $event['entity_type'],
                'entity_id'   => $event['entity_id']
            ];

            storeAppend('flagged_records', [
                'source_file'       => 'events.csv',
                'row_number'        => 0,
                'issue_type'        => 'unmatched_reference',
                'issue_description' => $issueDescription,
                'original_data'     => $originalData,
                'resolved'          => false,
                'resolved_at'       => null,
                'created_at'        => date('Y-m-d H:i:s')
            ]);

            $summary['flagged']++;
        }
    }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Determines the issue_type ENUM value based on validation error messages.
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

    return 'missing_field';
}

/**
 * Returns a human-readable message for PHP file upload error codes.
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
