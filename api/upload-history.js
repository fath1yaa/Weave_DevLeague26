const { storeRead, storeWrite, storeDelete } = require('./_lib/store');
const { jsonResponse, errorResponse, setCors } = require('./_lib/helpers');

module.exports = (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  switch (req.method) {
    case 'GET': return handleGet(res);
    case 'DELETE': return handleDelete(req, res);
    default: return errorResponse(res, 'Method not allowed. Use GET or DELETE.', 405);
  }
};

function handleGet(res) {
  const history = storeRead('upload_history');
  history.sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
  jsonResponse(res, { success: true, history });
}

function handleDelete(req, res) {
  if (req.query.clear_all === 'true') {
    const stores = ['roles', 'people', 'events', 'role_assignments', 'flagged_records', 'upload_history'];
    stores.forEach(store => storeWrite(store, []));
    return jsonResponse(res, { success: true, message: 'All data cleared successfully.' });
  }

  if (req.query.id) {
    const id = parseInt(req.query.id, 10);
    if (id <= 0) return errorResponse(res, 'Invalid ID.');
    const deleted = storeDelete('upload_history', 'id', id);
    if (deleted) return jsonResponse(res, { success: true, message: 'Record removed.' });
    return errorResponse(res, 'Record not found.', 404);
  }

  errorResponse(res, 'Provide ?id={id} or ?clear_all=true.');
}
