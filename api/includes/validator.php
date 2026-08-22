<?php
/**
 * Row-Level Validator - Weave Application
 * 
 * Provides functions to validate individual CSV rows including
 * required field checks, date format validation, and type checking.
 */

require_once __DIR__ . '/helpers.php';

/**
 * Returns the list of required fields for a given file type.
 *
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Array of required field names.
 */
function getRequiredFields($fileType) {
    $fields = [
        'roles' => ['role_id', 'title', 'department', 'effective_from'],
        'people' => ['person_id', 'name', 'role_id', 'start_date'],
        'events' => ['event_id', 'event_type', 'entity_type', 'entity_id', 'effective_date']
    ];

    return isset($fields[$fileType]) ? $fields[$fileType] : [];
}

/**
 * Returns the date fields that need validation for a given file type.
 *
 * @param string $fileType One of 'roles', 'people', 'events'.
 * @return array Associative array with 'required' and 'optional' date field lists.
 */
function getDateFields($fileType) {
    $dateFields = [
        'roles' => [
            'required' => ['effective_from'],
            'optional' => ['effective_to']
        ],
        'people' => [
            'required' => ['start_date'],
            'optional' => ['end_date']
        ],
        'events' => [
            'required' => ['effective_date'],
            'optional' => []
        ]
    ];

    return isset($dateFields[$fileType]) ? $dateFields[$fileType] : ['required' => [], 'optional' => []];
}

/**
 * Validates a date field value.
 *
 * @param string $value     The date value to validate.
 * @param string $fieldName The name of the field (for error messages).
 * @return string|null Error message string if invalid, null if valid.
 */
function validateDateField($value, $fieldName) {
    if (empty(trim($value))) {
        return null; // Empty values are handled by required field checks
    }

    if (!validateDate($value)) {
        return "Invalid date format for '$fieldName': expected YYYY-MM-DD, got '$value'";
    }

    return null;
}

/**
 * Validates an event_type value against the allowed ENUM values.
 *
 * @param string $value The event_type value to validate.
 * @return string|null Error message string if invalid, null if valid.
 */
function validateEventType($value) {
    $allowedTypes = [
        'title_change',
        'reporting_change',
        'promotion',
        'transfer',
        'department_change',
        'hire',
        'departure',
        'restructure'
    ];

    if (empty(trim($value))) {
        return null; // Empty values are handled by required field checks
    }

    if (!in_array(strtolower(trim($value)), $allowedTypes)) {
        return "Invalid event_type: '$value'. Allowed values: " . implode(', ', $allowedTypes);
    }

    return null;
}

/**
 * Validates an entity_type value (must be 'role' or 'person').
 *
 * @param string $value The entity_type value to validate.
 * @return string|null Error message string if invalid, null if valid.
 */
function validateEntityType($value) {
    $allowedTypes = ['role', 'person'];

    if (empty(trim($value))) {
        return null; // Empty values are handled by required field checks
    }

    if (!in_array(strtolower(trim($value)), $allowedTypes)) {
        return "Invalid entity_type: '$value'. Allowed values: role, person";
    }

    return null;
}

/**
 * Validates a single CSV row against the rules for a given file type.
 *
 * @param array  $row       Associative array representing a CSV row (header => value).
 * @param string $fileType  One of 'roles', 'people', 'events'.
 * @param int    $rowNumber The row number in the original file (for error reporting).
 * @return array Associative array with 'valid' (bool) and 'errors' (array of error strings).
 */
function validateRow($row, $fileType, $rowNumber) {
    $errors = [];

    // 1. Check required fields are non-empty
    $requiredFields = getRequiredFields($fileType);
    foreach ($requiredFields as $field) {
        if (!isset($row[$field]) || trim($row[$field]) === '') {
            $errors[] = "Row $rowNumber: Missing required field '$field'";
        }
    }

    // 2. Validate date fields
    $dateFields = getDateFields($fileType);

    // Validate required date fields (format only if not empty, emptiness caught above)
    foreach ($dateFields['required'] as $field) {
        if (isset($row[$field]) && trim($row[$field]) !== '') {
            $dateError = validateDateField($row[$field], $field);
            if ($dateError !== null) {
                $errors[] = "Row $rowNumber: $dateError";
            }
        }
    }

    // Validate optional date fields (only check format if value is provided)
    foreach ($dateFields['optional'] as $field) {
        if (isset($row[$field]) && trim($row[$field]) !== '') {
            $dateError = validateDateField($row[$field], $field);
            if ($dateError !== null) {
                $errors[] = "Row $rowNumber: $dateError";
            }
        }
    }

    // 3. Validate event-specific fields
    if ($fileType === 'events') {
        // Validate event_type
        if (isset($row['event_type']) && trim($row['event_type']) !== '') {
            $eventTypeError = validateEventType($row['event_type']);
            if ($eventTypeError !== null) {
                $errors[] = "Row $rowNumber: $eventTypeError";
            }
        }

        // Validate entity_type
        if (isset($row['entity_type']) && trim($row['entity_type']) !== '') {
            $entityTypeError = validateEntityType($row['entity_type']);
            if ($entityTypeError !== null) {
                $errors[] = "Row $rowNumber: $entityTypeError";
            }
        }
    }

    return [
        'valid' => empty($errors),
        'errors' => $errors
    ];
}
