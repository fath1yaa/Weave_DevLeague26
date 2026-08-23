const { storeRead, storeWrite, storeAppend } = require('./_lib/store');
const { jsonResponse, errorResponse, sanitizeInput, validateDate, setCors } = require('./_lib/helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = sanitizeInput(req.query.action || '');

  switch (action) {
    case 'list': return handleList(req, res);
    case 'get': return handleGet(req, res);
    case 'stats': return handleStats(res);
    case 'resolve': return handleResolve(req, res);
    default: return errorResponse(res, `Unknown action: '${action}'. Valid: list, get, stats, resolve.`);
  }
};

function handleList(req, res) {
  let flagged = storeRead('flagged_records');

  const issueTypeFilter = req.query.issue_type || null;
  const resolvedFilter = req.query.resolved !== undefined && req.query.resolved !== '' ? req.query.resolved === '1' : null;

  if (issueTypeFilter) {
    flagged = flagged.filter(r => r.issue_type === issueTypeFilter);
  }
  if (resolvedFilter !== null) {
    flagged = flagged.filter(r => r.resolved === resolvedFilter);
  }

  flagged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const qualityScore = calculateQualityScore();
  const categories = getCategoryCounts();

  jsonResponse(res, { success: true, quality_score: qualityScore, flagged_records: flagged, categories });
}

function handleGet(req, res) {
  const flagId = parseInt(req.query.flag_id, 10);
  if (!flagId || flagId <= 0) return errorResponse(res, 'Missing or invalid flag_id');

  const flagged = storeRead('flagged_records');
  const record = flagged.find(r => r.id === flagId);
  if (!record) return errorResponse(res, `Flagged record with id ${flagId} not found.`, 404);

  jsonResponse(res, { success: true, record });
}

function handleStats(res) {
  const flagged = storeRead('flagged_records');
  const totalRecords = getTotalRecordCount();
  const resolvedCount = flagged.filter(r => r.resolved === true).length;
  const unresolvedCount = flagged.length - resolvedCount;

  jsonResponse(res, {
    success: true,
    total_records: totalRecords,
    flagged_count: flagged.length,
    resolved_count: resolvedCount,
    unresolved_count: unresolvedCount,
    quality_score: calculateQualityScore()
  });
}

async function handleResolve(req, res) {
  if (req.method !== 'PUT') return errorResponse(res, 'Use PUT for resolve.', 405);

  const flagId = parseInt(req.query.flag_id, 10);
  if (!flagId || flagId <= 0) return errorResponse(res, 'Missing or invalid flag_id');

  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      return errorResponse(res, 'Invalid request body.');
    }
  }

  if (!body || !body.resolved_data) {
    return errorResponse(res, 'Expected JSON with "resolved_data" object.');
  }

  const flagged = storeRead('flagged_records');
  const index = flagged.findIndex(r => r.id === flagId);
  if (index === -1) return errorResponse(res, `Flagged record with id ${flagId} not found.`, 404);
  if (flagged[index].resolved === true) return errorResponse(res, `Record already resolved.`);

  // Mark as resolved
  flagged[index].resolved = true;
  flagged[index].resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  storeWrite('flagged_records', flagged);

  jsonResponse(res, { success: true, validation_passed: true, message: 'Record resolved successfully.' });
}

// Helpers
function calculateQualityScore() {
  const total = getTotalRecordCount();
  const flagged = storeRead('flagged_records');
  const unresolved = flagged.filter(r => r.resolved === false).length;
  if (total === 0) return 100;
  return Math.round(((total - unresolved) / total) * 1000) / 10;
}

function getTotalRecordCount() {
  return storeRead('roles').length + storeRead('people').length + storeRead('events').length;
}

function getCategoryCounts() {
  const flagged = storeRead('flagged_records');
  const cats = { missing_field: 0, unmatched_reference: 0, date_conflict: 0, duplicate: 0 };
  flagged.forEach(r => { if (!r.resolved && cats[r.issue_type] !== undefined) cats[r.issue_type]++; });
  return cats;
}
