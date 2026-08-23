const { storeRead } = require('./_lib/store');
const { jsonResponse, errorResponse, sanitizeInput, setCors } = require('./_lib/helpers');

module.exports = (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return errorResponse(res, 'Method not allowed', 405);

  const type = sanitizeInput(req.query.type || '');
  const id = sanitizeInput(req.query.id || '');

  if (!type || !['role', 'person'].includes(type)) {
    return errorResponse(res, 'Invalid type. Use: role or person');
  }
  if (!id) return errorResponse(res, 'id parameter is required');

  if (type === 'role') return handleRoleConnections(id, res);
  return handlePersonConnections(id, res);
};

function handleRoleConnections(roleId, res) {
  const roles = storeRead('roles');
  const events = storeRead('events');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');

  const role = roles.find(r => r.role_id === roleId);
  if (!role) return errorResponse(res, 'Role not found', 404);

  const roleEvents = events.filter(e => e.entity_type === 'role' && e.entity_id === roleId);

  // Temporal correlations (within 30 days)
  const correlatedEvents = [];
  for (const event of roleEvents) {
    const eventDate = new Date(event.effective_date);
    const correlated = events
      .filter(e => e.entity_id !== roleId && Math.abs((new Date(e.effective_date) - eventDate) / 86400000) <= 30)
      .slice(0, 10)
      .map(e => {
        let entityName = e.entity_id;
        if (e.entity_type === 'role') {
          const r = roles.find(r2 => r2.role_id === e.entity_id);
          if (r) entityName = r.title;
        } else {
          const p = people.find(p2 => p2.person_id === e.entity_id);
          if (p) entityName = p.name;
        }
        return { ...e, entity_name: entityName };
      });

    if (correlated.length > 0) {
      correlatedEvents.push({ source_event: event, correlated });
    }
  }

  const peopleMap = {};
  people.forEach(p => { peopleMap[p.person_id] = p.name; });

  const connectedPeople = assignments
    .filter(a => a.role_id === roleId)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
    .map(a => ({ person_id: a.person_id, name: peopleMap[a.person_id] || null, start_date: a.start_date, end_date: a.end_date }));

  let relatedRoles = [];
  if (role.department) {
    relatedRoles = roles
      .filter(r => r.department === role.department && r.role_id !== roleId)
      .slice(0, 10)
      .map(r => ({ role_id: r.role_id, title: r.title, department: r.department }));
  }

  jsonResponse(res, { success: true, entity_type: 'role', entity: role, connected_people: connectedPeople, related_roles: relatedRoles, correlated_events: correlatedEvents });
}

function handlePersonConnections(personId, res) {
  const roles = storeRead('roles');
  const events = storeRead('events');
  const assignments = storeRead('role_assignments');
  const people = storeRead('people');

  const person = people.find(p => p.person_id === personId);
  if (!person) return errorResponse(res, 'Person not found', 404);

  const personEvents = events.filter(e => e.entity_type === 'person' && e.entity_id === personId);

  // Temporal correlations
  const correlatedEvents = [];
  for (const event of personEvents) {
    const eventDate = new Date(event.effective_date);
    const correlated = events
      .filter(e => e.entity_id !== personId && Math.abs((new Date(e.effective_date) - eventDate) / 86400000) <= 30)
      .slice(0, 10)
      .map(e => {
        let entityName = e.entity_id;
        if (e.entity_type === 'role') {
          const r = roles.find(r2 => r2.role_id === e.entity_id);
          if (r) entityName = r.title;
        } else {
          const p = people.find(p2 => p2.person_id === e.entity_id);
          if (p) entityName = p.name;
        }
        return { ...e, entity_name: entityName };
      });

    if (correlated.length > 0) {
      correlatedEvents.push({ source_event: event, correlated });
    }
  }

  const rolesMap = {};
  roles.forEach(r => { rolesMap[r.role_id] = r; });

  const connectedRoles = assignments
    .filter(a => a.person_id === personId)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
    .map(a => ({
      role_id: a.role_id,
      title: rolesMap[a.role_id] ? rolesMap[a.role_id].title : null,
      department: rolesMap[a.role_id] ? rolesMap[a.role_id].department : null,
      start_date: a.start_date,
      end_date: a.end_date
    }));

  // Related people via shared roles
  const relatedPeople = [];
  for (const role of connectedRoles) {
    const others = assignments
      .filter(a => a.role_id === role.role_id && a.person_id !== personId)
      .slice(0, 5)
      .map(a => {
        const p = people.find(p2 => p2.person_id === a.person_id);
        return { person_id: a.person_id, name: p ? p.name : null, start_date: a.start_date, end_date: a.end_date };
      });
    if (others.length > 0) {
      relatedPeople.push({ via_role: role.title, role_id: role.role_id, people: others });
    }
  }

  jsonResponse(res, { success: true, entity_type: 'person', entity: person, connected_roles: connectedRoles, related_people: relatedPeople, correlated_events: correlatedEvents });
}
