/**
 * Shared Helpers - Weave Application (Node.js version)
 */

/**
 * Send a JSON response
 */
function jsonResponse(res, data, statusCode = 200) {
  res.status(statusCode).json(data);
}

/**
 * Send an error response
 */
function errorResponse(res, message, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: message });
}

/**
 * Validate date string is YYYY-MM-DD and represents a valid date
 */
function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Sanitise input string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\0/g, '').replace(/<[^>]*>/g, '');
}

/**
 * Set CORS headers on response
 */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

module.exports = { jsonResponse, errorResponse, validateDate, sanitizeInput, setCors };
