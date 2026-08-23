const bcrypt = require('bcryptjs');
const { storeRead } = require('./_lib/store');
const { jsonResponse, errorResponse, setCors } = require('./_lib/helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action || '';

  switch (action) {
    case 'check': return handleCheck(req, res);
    case 'login': return handleLogin(req, res);
    case 'logout': return handleLogout(req, res);
    default: return errorResponse(res, 'Invalid action. Use: check, login, logout.');
  }
};

function handleCheck(req, res) {
  // Stateless on Vercel — no sessions. Frontend manages auth state.
  jsonResponse(res, { authenticated: false, user: null });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return errorResponse(res, 'Method not allowed. Use POST for login.', 405);

  let body = req.body;
  if (!body) {
    // Parse body manually if not auto-parsed
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      return errorResponse(res, 'Invalid request body.');
    }
  }

  const { username, password } = body || {};
  if (!username || !password) return errorResponse(res, 'Username and password are required.');

  const users = storeRead('users');
  const user = users.find(u => u.username === username.trim());

  if (!user) return errorResponse(res, 'Invalid username or password.', 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return errorResponse(res, 'Invalid username or password.', 401);

  const sessionUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role
  };

  jsonResponse(res, { success: true, message: 'Login successful.', user: sessionUser });
}

function handleLogout(req, res) {
  jsonResponse(res, { success: true, message: 'Logged out successfully.' });
}
