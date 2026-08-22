<?php
/**
 * CSV Parser - Weave Application
 * 
 * Provides functions to parse CSV files and validate their headers
 * against expected schemas for roles.csv, people.csv, and events.csv.
 */

require_once __DIR__ . '/helpers.php';

/**
 * Returns the expected schema for a given file type.
 *
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array|null Associative array with 'required_headers' and 'all_headers', or null if invalid type.
 */
function getExpectedSchema($fileType) {
    $schemas = [
        'roles' => [
            'required_headers' => ['role_id', 'title', 'department', 'effective_from'],
            'all_headers' => ['role_id', 'title', 'department', 'reports_to', 'effective_from', 'effective_to']
        ],
        'people' => [
            'required_headers' => ['person_id', 'name', 'role_id', 'start_date'],
            'all_headers' => ['person_id', 'name', 'role_id', 'start_date', 'end_date']
        ],
        'events' => [
            'required_headers' => ['event_id', 'event_type', 'entity_type', 'entity_id', 'effective_date'],
            'all_headers' => ['event_id', 'event_type', 'entity_type', 'entity_id', 'previous_value', 'new_value', 'effective_date', 'description']
        ]
    ];

    return isset($schemas[$fileType]) ? $schemas[$fileType] : null;
}

/**
 * Validates CSV headers against the expected schema for a given file type.
 *
 * @param array  $headers  Array of header strings from the CSV file.
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Associative array with 'valid' (bool) and 'missing' (array of missing header names).
 */
function validateHeaders($headers, $fileType) {
    $schema = getExpectedSchema($fileType);

    if ($schema === null) {
        return [
            'valid' => false,
            'missing' => [],
            'error' => "Unknown file type: $fileType"
        ];
    }

    // Normalise headers: trim whitespace and convert to lowercase
    $normalised = array_map(function ($h) {
        return strtolower(trim($h));
    }, $headers);

    $missing = [];
    foreach ($schema['required_headers'] as $required) {
        if (!in_array($required, $normalised)) {
            $missing[] = $required;
        }
    }

    return [
        'valid' => empty($missing),
        'missing' => $missing
    ];
}

/**
 * Parses a CSV file from a file path, validates headers, and returns parsed data.
 *
 * @param string $filePath Absolute path to the CSV file.
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Associative array with 'headers', 'rows', 'valid', and 'errors'.
 */
function parseCSVFile($filePath, $fileType) {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        return [
            'headers' => [],
            'rows' => [],
            'valid' => false,
            'errors' => ["File not found or not readable: $filePath"]
        ];
    }

    $content = file_get_contents($filePath);
    if ($content === false) {
        return [
            'headers' => [],
            'rows' => [],
            'valid' => false,
            'errors' => ["Failed to read file: $filePath"]
        ];
    }

    return parseCSVContent($content, $fileType);
}

/**
 * Parses CSV content from a string, validates headers, and returns parsed data.
 *
 * @param string $content  The CSV content as a string.
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Associative array with 'headers', 'rows', 'valid', and 'errors'.
 */
function parseCSVContent($content, $fileType) {
    $errors = [];
    $rows = [];

    // Handle empty content
    if (empty(trim($content))) {
        return [
            'headers' => [],
            'rows' => [],
            'valid' => false,
            'errors' => ['File contains no data']
        ];
    }

    // Parse the CSV content using a temporary stream
    $stream = fopen('php://temp', 'r+');
    fwrite($stream, $content);
    rewind($stream);

    // Read the header row
    $headers = fgetcsv($stream);
    if ($headers === false || $headers === null) {
        fclose($stream);
        return [
            'headers' => [],
            'rows' => [],
            'valid' => false,
            'errors' => ['Unable to parse CSV headers']
        ];
    }

    // Remove BOM if present
    if (isset($headers[0])) {
        $headers[0] = preg_replace('/^\xEF\xBB\xBF/', '', $headers[0]);
    }

    // Normalise headers
    $headers = array_map(function ($h) {
        return strtolower(trim($h));
    }, $headers);

    // Validate headers against schema
    $headerValidation = validateHeaders($headers, $fileType);
    if (!$headerValidation['valid']) {
        fclose($stream);
        return [
            'headers' => $headers,
            'rows' => [],
            'valid' => false,
            'errors' => ['Missing required columns: ' . implode(', ', $headerValidation['missing'])]
        ];
    }

    // Parse data rows
    $rowNumber = 1; // Start at 1 (header is row 0)
    while (($row = fgetcsv($stream)) !== false) {
        $rowNumber++;

        // Skip completely empty rows
        if (count($row) === 1 && empty(trim($row[0]))) {
            continue;
        }

        // Map values to header keys
        $mappedRow = [];
        foreach ($headers as $index => $header) {
            $mappedRow[$header] = isset($row[$index]) ? trim($row[$index]) : '';
        }

        $mappedRow['_row_number'] = $rowNumber;
        $rows[] = $mappedRow;
    }

    fclose($stream);

    // Check if file has data rows
    if (empty($rows)) {
        return [
            'headers' => $headers,
            'rows' => [],
            'valid' => false,
            'errors' => ['File contains no data rows']
        ];
    }

    return [
        'headers' => $headers,
        'rows' => $rows,
        'valid' => true,
        'errors' => $errors
    ];
}
