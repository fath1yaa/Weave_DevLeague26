/**
 * JSON File Store - Weave Application (Node.js version)
 * 
 * Provides read/write functions for JSON file-based storage.
 * On Vercel serverless, the filesystem is read-only except /tmp.
 * For demo purposes, we read from data/ (bundled) and write to /tmp.
 * This means writes are ephemeral on Vercel but work locally.
 */

const fs = require('fs');
const path = require('path');

// In Vercel serverless, use /tmp for writes. Locally, use data/
const DATA_DIR = path.resolve(__dirname, '../../data');
const WRITE_DIR = process.env.VERCEL ? '/tmp/weave-data' : DATA_DIR;

const STORE_MAP = {
  roles: 'roles.json',
  people: 'people.json',
  events: 'events.json',
  role_assignments: 'role_assignments.json',
  flagged_records: 'flagged_records.json',
  upload_history: 'upload_history.json',
  users: 'users.json'
};

/**
 * Ensure the write directory exists
 */
function ensureWriteDir() {
  if (!fs.existsSync(WRITE_DIR)) {
    fs.mkdirSync(WRITE_DIR, { recursive: true });
  }
}

/**
 * Get the file path for a store (reads from WRITE_DIR first, falls back to DATA_DIR)
 */
function getReadPath(storeName) {
  const filename = STORE_MAP[storeName];
  if (!filename) throw new Error(`Unknown store: ${storeName}`);

  const writePath = path.join(WRITE_DIR, filename);
  if (fs.existsSync(writePath)) return writePath;

  const readPath = path.join(DATA_DIR, filename);
  if (fs.existsSync(readPath)) return readPath;

  return null;
}

/**
 * Read all records from a store
 */
function storeRead(storeName) {
  const filePath = getReadPath(storeName);
  if (!filePath) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || content.trim() === '') return [];
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/**
 * Write all records to a store
 */
function storeWrite(storeName, data) {
  const filename = STORE_MAP[storeName];
  if (!filename) throw new Error(`Unknown store: ${storeName}`);

  ensureWriteDir();
  const filePath = path.join(WRITE_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return true;
}

/**
 * Append a record to a store (with auto-ID for flagged_records)
 */
function storeAppend(storeName, record) {
  const data = storeRead(storeName);

  if (storeName === 'flagged_records') {
    let maxId = 0;
    for (const item of data) {
      if (item.id && item.id > maxId) maxId = item.id;
    }
    record.id = maxId + 1;
  }

  data.push(record);
  storeWrite(storeName, data);
  return record;
}

/**
 * Get next auto-increment ID for a store
 */
function storeNextId(storeName) {
  const data = storeRead(storeName);
  let maxId = 0;
  for (const item of data) {
    if (item.id && item.id > maxId) maxId = item.id;
  }
  return maxId + 1;
}

/**
 * Delete records matching key/value
 */
function storeDelete(storeName, key, value) {
  const data = storeRead(storeName);
  const filtered = data.filter(r => !(r[key] == value));
  if (filtered.length < data.length) {
    storeWrite(storeName, filtered);
    return true;
  }
  return false;
}

module.exports = { storeRead, storeWrite, storeAppend, storeNextId, storeDelete };
