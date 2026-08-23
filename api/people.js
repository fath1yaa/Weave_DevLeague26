const { storeRead } = require('./_lib/store');
const { jsonResponse, errorResponse, sanitizeInput, setCors } = require('./_lib/helpers');

module.exports = (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return errorResponse(res, 'Method not allowed', 405);

  const action = sanitizeInput(req.query.action || '');

  switch (action) {
    case 'search': return handleSearch(req, res);
    case 'journey': return handleJourney(req, res);
    case 'detail': return handleDetail(req, res);
    default: return errorResponse(res, 'Invalid action. Use: search, journey, or detail');
  }
};

function handleSearch(req, res) {
  const query = sanitizeInput(req.query.q || '');
  if (query.length < 1) return errorResponse(res, 'Search query must be at least 1 character');

  const people = storeRead('people');
  const assignments = storeRead('role_assignments');
  const roles = storeRead('roles');
  const queryLower = query.toLowerCase();

  let filtered = people.filter(p =>
    (p.name && p.name.toLowerCase().includes(queryLower)) ||
    (p.person_id && p.person_id.toLowerCase().includes(queryLower))
  );

  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  filtered = filtered.slice(0, 20);

  const rolesMap = {};
  roles.forEach(r => { rolesMap[r.role_id] = r; });

  const results = filtered.map(person => {
    const activeAssignment = assignments.find(a => a.person_id === person.person_id && a.end_date === null);
    let currentRole = null;
    let currentDepartment = null;
    if (activeAssignment && rolesMap[activeAssignment.role_id]) {
      currentRole = rolesMap[activeAssignment.role_id].title;
      currentDepartment = rolesMap[activeAssignment.role_id].department;
    }
    return {
      person_id: person.person_id,
      name: person.name,
      current_role: currentRole,
      current_department: currentDepartment
    };
  });

  jsonResponse(res, { success: true, count: results.length, results });
}

function handleJourney(req, res) {
  const personId = sanitizeInput(req.query.person_id || '');
  if (!personId) return errorResponse(res, 'person_id parameter is required');

  const people = storeRead('people');
  const events = storeRead('events');
  const assignments = storeRead('role_assignments');
  const roles = storeRead('roles');

  const person = people.find(p => p.person_id === personId);
  if (!person) return errorResponse(res, 'Person not found', 404);

  const rolesMap = {};
  roles.forEach(r => { rolesMap[r.role_id] = r; });

  // Current role
  const activeAssignment = assignments.find(a => a.person_id === personId && a.end_date === null);
  let currentRole = null;
  if (activeAssignment && rolesMap[activeAssignment.role_id]) {
    currentRole = {
      role_id: activeAssignment.role_id,
      title: rolesMap[activeAssignment.role_id].title,
      department: rolesMap[activeAssignment.role_id].department,
      start_date: activeAssignment.start_date
    };
  }

  // Events
  const personEvents = events
    .filter(e => e.entity_type === 'person' && e.entity_id === personId)
    .sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
    .map(e => ({
      event_id: e.event_id,
      event_type: e.event_type,
      previous_value: e.previous_value,
      new_value: e.new_value,
      effective_date: e.effective_date,
      description: e.description
    }));

  // All assignments (career path)
  const personAssignments = assignments
    .filter(a => a.person_id === personId)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
    .map(a => ({
      role_id: a.role_id,
      title: rolesMap[a.role_id] ? rolesMap[a.role_id].title : null,
      department: rolesMap[a.role_id] ? rolesMap[a.role_id].department : null,
      start_date: a.start_date,
      end_date: a.end_date
    }));

  jsonResponse(res, { success: true, person, current_role: currentRole, events: personEvents, assignments: personAssignments });
}

function handleDetail(req, res) {
  const personId = sanitizeInput(req.query.person_id || '');
  if (!personId) return errorResponse(res, 'person_id parameter is required');

  const people = storeRead('people');
  const assignments = storeRead('role_assignments');
  const roles = storeRead('roles');
  const events = storeRead('events');

  const person = people.find(p => p.person_id === personId);
  if (!person) return errorResponse(res, 'Person not found', 404);

  const rolesMap = {};
  roles.forEach(r => { rolesMap[r.role_id] = r; });

  const activeAssignment = assignments.find(a => a.person_id === personId && a.end_date === null);
  let currentRole = null;
  if (activeAssignment && rolesMap[activeAssignment.role_id]) {
    currentRole = {
      role_id: activeAssignment.role_id,
      title: rolesMap[activeAssignment.role_id].title,
      department: rolesMap[activeAssignment.role_id].department,
      reports_to: rolesMap[activeAssignment.role_id].reports_to,
      start_date: activeAssignment.start_date
    };
  }

  const totalRoles = assignments.filter(a => a.person_id === personId).length;
  const totalEvents = events.filter(e => e.entity_type === 'person' && e.entity_id === personId).length;

  jsonResponse(res, {
    success: true,
    person,
    current_role: currentRole,
    stats: { total_roles: totalRoles, total_events: totalEvents }
  });
}
