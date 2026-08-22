<?php
/**
 * JSON File Store - Weave Application
 * 
 * Provides read/write functions for JSON file-based storage.
 * Replaces MySQL/PDO with flat JSON files in the data/ directory.
 * Uses file locking (LOCK_EX) to prevent corruption on concurrent writes.
 */

// Path to the data directory (project root / data)
$dataPath = realpath(__DIR__ . '/../../data');
if ($dataPath === false) {
    // Fallback: construct path without realpath
    $dataPath = __DIR__ . '/../../data';
}
define('DATA_DIR', $dataPath . DIRECTORY_SEPARATOR);

/**
 * Maps store names to their JSON file paths.
 *
 * @param string $storeName One of 'roles', 'people', 'events', 'role_assignments', 'flagged_records'.
 * @return string Absolute file path to the JSON file.
 */
function storeFilePath($storeName) {
    $map = [
        'roles'            => 'roles.json',
        'people'           => 'people.json',
        'events'           => 'events.json',
        'role_assignments' => 'role_assignments.json',
        'flagged_records'  => 'flagged_records.json',
        'upload_history'   => 'upload_history.json'
    ];

    if (!isset($map[$storeName])) {
        throw new \RuntimeException("Unknown store: $storeName");
    }

    return DATA_DIR . $map[$storeName];
}

/**
 * Reads all records from a JSON store file.
 *
 * @param string $storeName The store to read from.
 * @return array Array of associative arrays (records).
 */
function storeRead($storeName) {
    $filePath = storeFilePath($storeName);

    if (!file_exists($filePath)) {
        return [];
    }

    $content = file_get_contents($filePath);
    if ($content === false || trim($content) === '') {
        return [];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [];
    }

    return $data;
}

/**
 * Writes all records to a JSON store file (overwrites existing content).
 *
 * @param string $storeName The store to write to.
 * @param array  $data      Array of records to write.
 * @return bool True on success, false on failure.
 */
function storeWrite($storeName, $data) {
    $filePath = storeFilePath($storeName);
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    return file_put_contents($filePath, $json, LOCK_EX) !== false;
}

/**
 * Appends a single record to a store. For stores with an 'id' field
 * (like flagged_records), auto-assigns the next ID.
 *
 * @param string $storeName The store to append to.
 * @param array  $record    The record to append.
 * @return array The record (with ID assigned if applicable).
 */
function storeAppend($storeName, $record) {
    $data = storeRead($storeName);

    // Auto-assign ID for flagged_records
    if ($storeName === 'flagged_records') {
        $maxId = 0;
        foreach ($data as $item) {
            if (isset($item['id']) && $item['id'] > $maxId) {
                $maxId = $item['id'];
            }
        }
        $record['id'] = $maxId + 1;
    }

    $data[] = $record;
    storeWrite($storeName, $data);

    return $record;
}

/**
 * Updates record(s) in a store that match a key/value pair.
 * Merges $newData into matching records.
 *
 * @param string $storeName The store to update in.
 * @param string $key       The field name to match on.
 * @param mixed  $value     The value to match.
 * @param array  $newData   Associative array of fields to update.
 * @return bool True if at least one record was updated.
 */
function storeUpdate($storeName, $key, $value, $newData) {
    $data = storeRead($storeName);
    $updated = false;

    foreach ($data as &$record) {
        if (isset($record[$key]) && $record[$key] == $value) {
            $record = array_merge($record, $newData);
            $updated = true;
        }
    }
    unset($record);

    if ($updated) {
        storeWrite($storeName, $data);
    }

    return $updated;
}

/**
 * Deletes record(s) from a store that match a key/value pair.
 *
 * @param string $storeName The store to delete from.
 * @param string $key       The field name to match on.
 * @param mixed  $value     The value to match.
 * @return bool True if at least one record was deleted.
 */
function storeDelete($storeName, $key, $value) {
    $data = storeRead($storeName);
    $originalCount = count($data);

    $data = array_values(array_filter($data, function ($record) use ($key, $value) {
        return !(isset($record[$key]) && $record[$key] == $value);
    }));

    if (count($data) < $originalCount) {
        storeWrite($storeName, $data);
        return true;
    }

    return false;
}

/**
 * Gets the next auto-increment ID for a store (based on max existing 'id' + 1).
 *
 * @param string $storeName The store to check.
 * @return int The next available ID.
 */
function storeNextId($storeName) {
    $data = storeRead($storeName);
    $maxId = 0;

    foreach ($data as $item) {
        if (isset($item['id']) && $item['id'] > $maxId) {
            $maxId = $item['id'];
        }
    }

    return $maxId + 1;
}
