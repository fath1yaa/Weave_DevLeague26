const { storeRead } = require('./_lib/store');
const { jsonResponse, errorResponse, sanitizeInput, setCors } = require('./_lib/helpers');

module.exports = (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return errorResponse(res, 'Method not allowed', 405);

  const action = sanitizeInput(req.query.action || '');

  switch (action) {
    case 'search': return handleSearch(req, res);
    case 'history': return handleHistory(req, res);
    case 'detail': return handleDetail(req, res);
    case 'departments': return handleDepartments(req, res);
    default: return errorResponse(res, 'Invalid action. Use: search, history, detail, or departments');
  }
};

function handleSearch(req, res) {
  const query = sanitizeInput(req.query.q || '');
  if (query.length < 1) return errorResponse(res, 'Search query must be at least 1 character');

  const roles = storeRead('roles');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');
  const queryLower = query.toLowerCase();

  let filtered = roles.filter(r =>
    (r.title && r.title.toLowerCase().includes(queryLower)) ||
    (r.role_id && r.role_id.toLowerCase().includes(queryLower))
  );

  filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  filtered = filtered.slice(0, 20);

  const peopleMap = {};
  people.forEach(p => { peopleMap[p.person_id] = p.name; });

  const results = filtered.map(role => {
    let currentOccupant = null;
    const assignment = assignments.find(a => a.role_id === role.role_id && a.end_date === null);
    if (assignment && peopleMap[assignment.person_id]) {
      currentOccupant = peopleMap[assignment.person_id];
    }
    return {
      role_id: role.role_id,
      title: role.title,
      department: role.department,
      reports_to: role.reports_to,
      effective_from: role.effective_from,
      effective_to: role.effective_to,
      current_occupant: currentOccupant
    };
  });

  jsonResponse(res, { success: true, count: results.length, results });
}

function handleHistory(req, res) {
  const roleId = sanitizeInput(req.query.role_id || '');
  if (!roleId) return errorResponse(res, 'role_id parameter is required');

  const roles = storeRead('roles');
  const events = storeRead('events');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');

  const role = roles.find(r => r.role_id === roleId);
  if (!role) return errorResponse(res, 'Role not found', 404);

  const roleEvents = events
    .filter(e => e.entity_type === 'role' && e.entity_id === roleId)
    .sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
    .map(e => ({
      event_id: e.event_id,
      event_type: e.event_type,
      previous_value: e.previous_value,
      new_value: e.new_value,
      effective_date: e.effective_date,
      description: e.description
    }));

  const peopleMap = {};
  people.forEach(p => { peopleMap[p.person_id] = p.name; });

  const occupants = assignments
    .filter(a => a.role_id === roleId)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
    .map(a => ({
      person_id: a.person_id,
      name: peopleMap[a.person_id] || null,
      start_date: a.start_date,
      end_date: a.end_date
    }));

  jsonResponse(res, { success: true, role, events: roleEvents, occupants });
}

function handleDetail(req, res) {
  const roleId = sanitizeInput(req.query.role_id || '');
  if (!roleId) return errorResponse(res, 'role_id parameter is required');

  const roles = storeRead('roles');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');

  const role = roles.find(r => r.role_id === roleId);
  if (!role) return errorResponse(res, 'Role not found', 404);

  const peopleMap = {};
  people.forEach(p => { peopleMap[p.person_id] = p; });

  let currentOccupant = null;
  const assignment = assignments.find(a => a.role_id === roleId && a.end_date === null);
  if (assignment && peopleMap[assignment.person_id]) {
    currentOccupant = {
      person_id: assignment.person_id,
      name: peopleMap[assignment.person_id].name,
      start_date: assignment.start_date
    };
  }

  let reportsToTitle = null;
  if (role.reports_to) {
    const parent = roles.find(r => r.role_id === role.reports_to);
    if (parent) reportsToTitle = parent.title;
  }

  jsonResponse(res, { success: true, role, current_occupant: currentOccupant, reports_to_title: reportsToTitle });
}

function handleDepartments(req, res) {
  const roles = storeRead('roles');
  const departments = {};

  roles.forEach(role => {
    const dept = role.department;
    if (dept) {
      if (!departments[dept]) {
        departments[dept] = { name: dept, role_count: 0, roles: [] };
      }
      departments[dept].role_count++;
      departments[dept].roles.push({ role_id: role.role_id, title: role.title });
    }
  });

  const sorted = Object.keys(departments).sort();
  const result = sorted.map(k => departments[k]);

  jsonResponse(res, { success: true, count: result.length, departments: result });
}
