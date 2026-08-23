const { storeRead } = require('./_lib/store');
const { jsonResponse, errorResponse, sanitizeInput, validateDate, setCors } = require('./_lib/helpers');

module.exports = (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return errorResponse(res, 'Method not allowed', 405);

  const action = sanitizeInput(req.query.action || '');

  if (action === 'date_range') return handleDateRange(res);
  return handleOrgState(req, res);
};

function handleDateRange(res) {
  const roles = storeRead('roles');
  const assignments = storeRead('role_assignments');
  const events = storeRead('events');
  const today = new Date().toISOString().slice(0, 10);
  const dates = [];

  roles.forEach(r => {
    if (r.effective_from) dates.push(r.effective_from);
    dates.push(r.effective_to || today);
  });
  assignments.forEach(a => {
    if (a.start_date) dates.push(a.start_date);
    dates.push(a.end_date || today);
  });
  events.forEach(e => {
    if (e.effective_date) dates.push(e.effective_date);
  });

  const range = dates.length > 0
    ? { min: dates.sort()[0], max: dates.sort()[dates.length - 1] }
    : { min: today, max: today };

  jsonResponse(res, { success: true, date_range: range });
}

function handleOrgState(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const date = sanitizeInput(req.query.date || '') || today;

  if (!validateDate(date)) return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD');

  const roles = storeRead('roles');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');
  const events = storeRead('events');

  // Active roles on date
  const activeRoles = roles.filter(r =>
    r.effective_from <= date && (r.effective_to === null || r.effective_to >= date)
  );

  activeRoles.sort((a, b) => {
    const d = (a.department || '').localeCompare(b.department || '');
    return d !== 0 ? d : (a.title || '').localeCompare(b.title || '');
  });

  // Active assignments on date
  const activeAssignments = assignments.filter(a =>
    a.start_date <= date && (a.end_date === null || a.end_date >= date)
  );

  const assignmentMap = {};
  activeAssignments.forEach(a => { assignmentMap[a.role_id] = a; });

  const peopleMap = {};
  people.forEach(p => { peopleMap[p.person_id] = p; });

  const nodes = activeRoles.map(role => {
    const occ = assignmentMap[role.role_id];
    let occupantName = null, personId = null;
    if (occ && peopleMap[occ.person_id]) {
      occupantName = peopleMap[occ.person_id].name;
      personId = occ.person_id;
    }
    return {
      role_id: role.role_id,
      title: role.title,
      department: role.department,
      reports_to: role.reports_to,
      occupant: occupantName,
      person_id: personId
    };
  });

  // Date range
  const allDates = [];
  roles.forEach(r => { if (r.effective_from) allDates.push(r.effective_from); allDates.push(r.effective_to || today); });
  assignments.forEach(a => { if (a.start_date) allDates.push(a.start_date); allDates.push(a.end_date || today); });
  events.forEach(e => { if (e.effective_date) allDates.push(e.effective_date); });
  const sorted = allDates.sort();
  const range = sorted.length > 0 ? { min: sorted[0], max: sorted[sorted.length - 1] } : { min: date, max: date };

  jsonResponse(res, { success: true, date, date_range: range, node_count: nodes.length, nodes });
}
