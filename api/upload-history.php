<?php
/**
 * Upload History API Endpoint - Weave Application
 * 
 * GET: Returns all upload history records (most recent first).
 * DELETE ?id={id}: Removes a specific history record.
 * DELETE ?clear_all=true: Clears ALL data stores for a fresh start.
 */

require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/helpers.php';

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        handleGet();
        break;
    case 'DELETE':
        handleDelete();
        break;
    default:
        errorResponse('Method not allowed. Use GET or DELETE.', 405);
}

function handleGet() {
    $history = storeRead('upload_history');

    // Sort by uploaded_at descending
    usort($history, function ($a, $b) {
        return strcmp($b['uploaded_at'] ?? '', $a['uploaded_at'] ?? '');
    });

    jsonResponse(['success' => true, 'history' => $history]);
}

function handleDelete() {
    // Clear all data
    if (isset($_GET['clear_all']) && $_GET['clear_all'] === 'true') {
        $stores = ['roles', 'people', 'events', 'role_assignments', 'flagged_records', 'upload_history'];
        foreach ($stores as $store) {
            storeWrite($store, []);
        }
        jsonResponse(['success' => true, 'message' => 'All data cleared successfully.']);
        return;
    }

    // Delete specific record
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        if ($id <= 0) {
            errorResponse('Invalid ID.', 400);
        }

        $deleted = storeDelete('upload_history', 'id', $id);
        if ($deleted) {
            jsonResponse(['success' => true, 'message' => 'Record removed.']);
        } else {
            errorResponse('Record not found.', 404);
        }
        return;
    }

    errorResponse('Provide ?id={id} or ?clear_all=true.', 400);
}
