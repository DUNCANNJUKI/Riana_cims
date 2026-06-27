const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const INSECURE_JWT_SECRETS = new Set(['', 'super-secret-key-change-in-prod', 'replace-with-a-long-random-secret']);

const resolveJwtSecret = (env = process.env) => {
  const runtimeSecretPath = path.join(__dirname, '../.runtime/jwt-secret');
  let persistedSecret = '';
  if (env === process.env) {
    try { persistedSecret = fs.readFileSync(runtimeSecretPath, 'utf8').trim(); } catch {}
  }
  const secret = String(env.JWT_SECRET || persistedSecret || '');
  if (env.NODE_ENV === 'production' && (secret.length < 32 || INSECURE_JWT_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET must be a unique random value of at least 32 characters in production.');
  }
  return secret || 'development-only-secret-not-for-production';
};

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => {
  const index = part.indexOf('=');
  if (index < 0) return ['', ''];
  return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
}).filter(([key]) => key));

const extractToken = (req) => {
  const authorization = String(req.headers.authorization || '');
  if (/^Bearer\s+\S+$/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '');
  return parseCookies(req.headers.cookie || '').riana_session || null;
};

const createSessionAuthenticator = ({ pool, jwtSecret }) => async (req, res, next) => {
  if (req.user?.id && req.currentUser) return next();
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    const [rows] = await pool.query(
      `SELECT u.id,u.email,u.role,u.is_active,u.first_login,u.session_version,
         COALESCE((SELECT GROUP_CONCAT(up.permission_id SEPARATOR ',') FROM user_permissions up WHERE up.user_id=u.id),'') AS extra_permissions
       FROM user_profiles u WHERE u.id = ? LIMIT 1`,
      [decoded.id],
    );
    const user = rows[0];
    if (!user?.is_active) return res.status(401).json({ error: 'Session is no longer active.' });
    if (Number(decoded.sv || 0) !== Number(user.session_version || 0)) {
      return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      sv: Number(user.session_version || 0),
      extra_permissions: String(user.extra_permissions || '').split(',').filter(Boolean),
    };
    req.currentUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
};

const PUBLIC_API_RULES = [
  ['GET', /^\/health$/],
  ['POST', /^\/auth\/(login|verify-2fa|forgot-password|reset-password)$/],
  ['POST', /^\/crms\/auth\/(login|verify-2fa)$/],
  ['GET', /^\/feedback_questions$/],
  ['GET', /^\/public\/company-branding$/],
  ['GET', /^\/public\/feedback-links\/[^/]+$/],
  ['POST', /^\/public\/installation-feedback$/],
  ['POST', /^\/public\/feedback-links\/[^/]+\/use$/],
];

const isPublicApiRequest = (req) => PUBLIC_API_RULES.some(([method, pattern]) => method === req.method && pattern.test(req.path));

const createGlobalApiPolicy = (authenticate) => (req, res, next) => (
  isPublicApiRequest(req) ? next() : authenticate(req, res, next)
);

const SENSITIVE_PATHS = [
  /^\/api\/(?:crms\/)?auth\/(?:login|verify-2fa|forgot-password|reset-password)$/,
  /^\/api\/upload$/,
  /^\/api\/public\//,
  /^\/api\/admin\/backup/,
  /^\/api\/(?:chat\/assistant|help\/send-documentation)$/,
];

const createSensitiveRateLimiter = ({ limit = 20, windowMs = 5 * 60 * 1000 } = {}) => {
  const buckets = new Map();
  return (req, res, next) => {
    if (!SENSITIVE_PATHS.some((pattern) => pattern.test(req.path))) return next();
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const bucket = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (bucket.length >= limit) {
      res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - bucket[0])) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    bucket.push(now);
    buckets.set(key, bucket);
    if (buckets.size > 5000) {
      for (const [entryKey, timestamps] of buckets) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) buckets.delete(entryKey);
      }
    }
    next();
  };
};

const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (_req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
};

const buildCorsOptions = (env = process.env) => {
  const configured = String(env.CORS_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  try { if (env.CIMS_LOGIN_URL) configured.push(new URL(env.CIMS_LOGIN_URL).origin); } catch {}
  configured.push(
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8090',
    'http://127.0.0.1:8090',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  );
  const allowed = new Set(configured);
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) return callback(null, true);
      callback(new Error('Origin is not allowed by CORS policy.'));
    },
  };
};

const canonicalAppUrl = (req, env = process.env) => {
  if (env.CIMS_LOGIN_URL) {
    const url = new URL(env.CIMS_LOGIN_URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('CIMS_LOGIN_URL must use HTTP or HTTPS.');
    return `${url.toString().replace(/\/+$/, '')}/`;
  }
  if (env.NODE_ENV === 'production') throw new Error('CIMS_LOGIN_URL is required in production.');
  const host = String(req.get('host') || 'localhost:8081');
  const safeHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? host : 'localhost:8081';
  return `${req.protocol}://${safeHost}/`;
};

const requireRole = (...roles) => (req, res, next) => (req.user?.role === 'SuperAdmin' || roles.includes(req.user?.role))
  ? next()
  : res.status(403).json({ error: 'Insufficient permissions.' });

const safeUpload = ({ fileName, base64Data, maxBytes = 10 * 1024 * 1024 }) => {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  const allowed = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
  if (!allowed.has(extension)) throw Object.assign(new Error('Only PDF, PNG, JPEG, and WebP files are allowed.'), { status: 400 });
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(String(base64Data || ''))) throw Object.assign(new Error('Invalid base64 file data.'), { status: 400 });
  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw Object.assign(new Error('File must be between 1 byte and 10 MB.'), { status: 413 });
  const signatures = {
    '.pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
    '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
    '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9,
    '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9,
    '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  };
  if (!signatures[extension](buffer)) throw Object.assign(new Error('File content does not match its extension.'), { status: 400 });
  return { buffer, storedName: `${crypto.randomUUID()}${extension}`, extension };
};

const resolveStoredFile = (uploadsDir, filename) => {
  const name = path.basename(String(filename || ''));
  if (!name || name !== filename) return null;
  const resolved = path.resolve(uploadsDir, name);
  return resolved.startsWith(`${path.resolve(uploadsDir)}${path.sep}`) ? resolved : null;
};

const auditSecurityEvent = async (pool, req, action, details = {}, outcome = 'success') => {
  try {
    await pool.query(
      `INSERT INTO security_audit_events
       (id,actor_user_id,module,action,outcome,source_ip,details) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), req.user?.id || null, 'CIMS', action, outcome, req.ip || null, JSON.stringify(details)],
    );
  } catch (error) {
    console.error('Security audit write failed:', error.message);
  }
};

module.exports = {
  auditSecurityEvent,
  buildCorsOptions,
  canonicalAppUrl,
  createGlobalApiPolicy,
  createSensitiveRateLimiter,
  createSessionAuthenticator,
  parseCookies,
  requireRole,
  resolveJwtSecret,
  resolveStoredFile,
  safeUpload,
  securityHeaders,
};
