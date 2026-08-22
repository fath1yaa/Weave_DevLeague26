<?php
/**
 * Shared Utility Functions - Weave Application
 * 
 * Provides common helper functions used across API endpoints:
 * JSON response formatting, date validation, and input sanitisation.
 */

/**
 * Sends a JSON response with the given data and HTTP status code, then exits.
 *
 * @param mixed $data       The data to encode as JSON.
 * @param int   $statusCode HTTP status code (default 200).
 * @return void
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

/**
 * Sends a JSON error response with a standard error structure, then exits.
 *
 * @param string $message    The error message.
 * @param int    $statusCode HTTP status code (default 400).
 * @return void
 */
function errorResponse($message, $statusCode = 400) {
    jsonResponse([
        'success' => false,
        'error'   => $message
    ], $statusCode);
}

/**
 * Validates that a date string is in YYYY-MM-DD format and represents a valid date.
 *
 * @param string $dateStr The date string to validate.
 * @return bool True if valid, false otherwise.
 */
function validateDate($dateStr) {
    if (!is_string($dateStr)) {
        return false;
    }

    // Check format matches YYYY-MM-DD
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) {
        return false;
    }

    // Verify it represents a real calendar date
    $parts = explode('-', $dateStr);
    return checkdate((int)$parts[1], (int)$parts[2], (int)$parts[0]);
}

/**
 * Sanitises user input by trimming whitespace, removing null bytes, and stripping HTML tags.
 *
 * @param string $input The raw input string.
 * @return string The sanitised string.
 */
function sanitizeInput($input) {
    if (!is_string($input)) {
        return '';
    }

    // Trim whitespace
    $input = trim($input);

    // Remove null bytes
    $input = str_replace("\0", '', $input);

    // Strip HTML/PHP tags
    $input = strip_tags($input);

    return $input;
}
