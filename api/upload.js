const { storeRead, storeWrite, storeAppend, storeNextId } = require('./_lib/store');
const { jsonResponse, errorResponse, validateDate, setCors } = require('./_lib/helpers');

// Disable Vercel body parsing for multipart
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return errorResponse(res, 'Method not allowed. Use POST.', 405);

  try {
    const multiparty = require('multiparty');
    const form = new multiparty.Form({ maxFilesSize: 10 * 1024 * 1024 });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const fileFields = ['roles_csv', 'people_csv', 'events_csv'];
    let hasFile = false;
    for (const field of fileFields) {
      if (files[field] && files[field].length > 0) { hasFile = true; break; }
    }
    if (!hasFile) return errorResponse(res, 'No CSV file uploaded.');

    const summary = { roles_imported: 0, people_imported: 0, events_imported: 0, flagged: 0 };
    const fs = require('fs');
    const { parse } = require('csv-parse/sync');

    for (const field of fileFields) {
      if (!files[field] || files[field].length === 0) continue;
      const file = files[field][0];
      const content = fs.readFileSync(file.path, 'utf8');
      const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
      const fileType = field.replace('_csv', '');

      if (fileType === 'roles') processRoles(records, summary);
      else if (fileType === 'people') processPeople(records, summary);
      else if (fileType === 'events') processEvents(records, summary);

      // Log upload history
      const history = storeRead('upload_history');
      history.push({
        id: storeNextId('upload_history'),
        file_type: fileType,
        file_name: file.originalFilename,
        records_imported: fileType === 'roles' ? summary.roles_imported : fileType === 'people' ? summary.people_imported : summary.events_imported,
        records_flagged: summary.flagged,
        uploaded_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
      storeWrite('upload_history', history);
    }

    jsonResponse(res, { success: true, summary });
  } catch (err) {
    console.error('Upload error:', err);
    errorResponse(res, 'Upload failed: ' + err.message, 500);
  }
};

function processRoles(records, summary) {
  const roles = storeRead('roles');
  const existingIds = roles.map(r => r.role_id);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row.role_id || !row.title || !row.department || !row.effective_from) {
      flagRecord('roles.csv', i + 2, 'missing_field', 'Missing required field', row, summary);
      continue;
    }
    if (!validateDate(row.effective_from)) {
      flagRecord('roles.csv', i + 2, 'date_conflict', 'Invalid date: effective_from', row, summary);
      continue;
    }
    if (existingIds.includes(row.role_id)) continue;

    roles.push({
      role_id: row.role_id,
      title: row.title,
      department: row.department,
      reports_to: row.reports_to || null,
      effective_from: row.effective_from,
      effective_to: row.effective_to || null
    });
    existingIds.push(row.role_id);
    summary.roles_imported++;
  }
  storeWrite('roles', roles);
}

function processPeople(records, summary) {
  const people = storeRead('people');
  const assignments = storeRead('role_assignments');
  const existingPersonIds = people.map(p => p.person_id);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row.person_id || !row.name || !row.role_id || !row.start_date) {
      flagRecord('people.csv', i + 2, 'missing_field', 'Missing required field', row, summary);
      continue;
    }
    if (!validateDate(row.start_date)) {
      flagRecord('people.csv', i + 2, 'date_conflict', 'Invalid date: start_date', row, summary);
      continue;
    }

    if (!existingPersonIds.includes(row.person_id)) {
      people.push({ person_id: row.person_id, name: row.name });
      existingPersonIds.push(row.person_id);
    }

    const dupAssignment = assignments.find(a => a.person_id === row.person_id && a.role_id === row.role_id && a.start_date === row.start_date);
    if (!dupAssignment) {
      assignments.push({
        person_id: row.person_id,
        role_id: row.role_id,
        start_date: row.start_date,
        end_date: row.end_date || null
      });
    }
    summary.people_imported++;
  }
  storeWrite('people', people);
  storeWrite('role_assignments', assignments);
}

function processEvents(records, summary) {
  const events = storeRead('events');
  const existingIds = events.map(e => e.event_id);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row.event_id || !row.event_type || !row.entity_type || !row.entity_id || !row.effective_date) {
      flagRecord('events.csv', i + 2, 'missing_field', 'Missing required field', row, summary);
      continue;
    }
    if (!validateDate(row.effective_date)) {
      flagRecord('events.csv', i + 2, 'date_conflict', 'Invalid date: effective_date', row, summary);
      continue;
    }
    if (existingIds.includes(row.event_id)) continue;

    events.push({
      event_id: row.event_id,
      event_type: row.event_type.toLowerCase(),
      entity_type: row.entity_type.toLowerCase(),
      entity_id: row.entity_id,
      previous_value: row.previous_value || null,
      new_value: row.new_value || null,
      effective_date: row.effective_date,
      description: row.description || null
    });
    existingIds.push(row.event_id);
    summary.events_imported++;
  }
  storeWrite('events', events);
}

function flagRecord(sourceFile, rowNumber, issueType, description, originalData, summary) {
  storeAppend('flagged_records', {
    source_file: sourceFile,
    row_number: rowNumber,
    issue_type: issueType,
    issue_description: description,
    original_data: originalData,
    resolved: false,
    resolved_at: null,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  });
  summary.flagged++;
}
