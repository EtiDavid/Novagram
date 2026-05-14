const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS    = 60 * 1000;

function loginRateLimiter(socketId) {
  const now    = Date.now();
  const record = attempts.get(socketId) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + WINDOW_MS; }
  record.count++;
  attempts.set(socketId, record);
  return record.count <= MAX_ATTEMPTS;
}

function clearAttempts(socketId) {
  attempts.delete(socketId);
}

module.exports = { loginRateLimiter, clearAttempts };
