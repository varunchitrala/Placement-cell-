// ─────────────────────────────────────────────────────────────────
//  security.js — all protection middleware in one place
//  Gracefully falls back if a package is not yet installed.
//  Run  npm install  to activate full protection.
// ─────────────────────────────────────────────────────────────────

function safeRequire(pkg) {
  try { return require(pkg); }
  catch { return null; }
}

const helmet      = safeRequire('helmet');
const rateLimit   = safeRequire('express-rate-limit');
const slowDown    = safeRequire('express-slow-down');
const compression = safeRequire('compression');
const cors        = require('cors');

const noop = (_req, _res, next) => next();

// ── 1. Helmet ─────────────────────────────────────────────────────
const helmetMiddleware = helmet
  ? helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:  ["'self'"],

          // Inline <script> blocks + onclick/onsubmit/oninput attributes
          scriptSrc:     ["'self'", "'unsafe-inline'",
                          "https://cdnjs.cloudflare.com",
                          "https://fonts.googleapis.com"],

          // *** THIS IS THE FIX ***
          // Helmet adds script-src-attr 'none' by default which blocks
          // every onclick=, onsubmit=, oninput= etc. in the HTML.
          // Setting it to 'unsafe-inline' allows those handlers.
          scriptSrcAttr: ["'unsafe-inline'"],

          styleSrc:    ["'self'", "'unsafe-inline'",
                        "https://cdnjs.cloudflare.com",
                        "https://fonts.googleapis.com"],
          fontSrc:     ["'self'",
                        "https://fonts.gstatic.com",
                        "https://cdnjs.cloudflare.com"],
          imgSrc:      ["'self'", "data:", "blob:",
                        "https://drive.google.com",
                        "https://lh3.googleusercontent.com",
                        "https://*.googleusercontent.com"],
          connectSrc:  ["'self'", "http://localhost:*", "ws://localhost:*"],
          frameSrc:    ["'none'"],
          objectSrc:   ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  : noop;

// ── 2. CORS ───────────────────────────────────────────────────────
const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
      : [];
    if (allowed.length === 0 || allowed.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
  maxAge:         86400,
});

// ── 3. Compression ────────────────────────────────────────────────
const compressionMiddleware = compression
  ? compression({ level: 6, threshold: 1024 })
  : noop;

// ── 4. Payload size limits ────────────────────────────────────────
const jsonLimit       = '50kb';
const urlencodedLimit = '50kb';

// ── 5. Global rate limiter ────────────────────────────────────────
const globalLimiter = rateLimit
  ? rateLimit({
      windowMs:        60 * 1000,
      max:             500,
      standardHeaders: true,
      legacyHeaders:   false,
      message:         { success: false, message: 'Too many requests. Please wait and try again.' },
      skip:            (req) => req.path === '/api/health',
    })
  : noop;

// ── 6. Slow-down ──────────────────────────────────────────────────
let speedLimiter = noop;
if (slowDown) {
  try {
    speedLimiter = slowDown({
      windowMs:   60 * 1000,
      delayAfter: 200,
      delayMs:    (used) => Math.min(used * 50, 2000),
    });
  } catch {
    speedLimiter = noop;
  }
}

// ── 7. Auth limiter ───────────────────────────────────────────────
const authLimiter = rateLimit
  ? rateLimit({
      windowMs:               15 * 60 * 1000,
      max:                    30,
      standardHeaders:        true,
      legacyHeaders:          false,
      skipSuccessfulRequests: true,
      message:                { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
    })
  : noop;

// ── 8. Register limiter ───────────────────────────────────────────
const registerLimiter = rateLimit
  ? rateLimit({
      windowMs:        60 * 60 * 1000,
      max:             15,
      standardHeaders: true,
      legacyHeaders:   false,
      message:         { success: false, message: 'Too many registration attempts. Try again later.' },
    })
  : noop;

// ── 9. Input sanitiser ────────────────────────────────────────────
function sanitiseInput(req, _res, next) {
  if (req.body)   sanitiseObject(req.body);
  if (req.query)  sanitiseObject(req.query);
  if (req.params) sanitiseObject(req.params);
  next();
}
function sanitiseObject(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key].replace(/\0/g, '').trim();
    } else if (obj[key] && typeof obj[key] === 'object') {
      sanitiseObject(obj[key]);
    }
  }
}

// ── 10. Prototype pollution guard ────────────────────────────────
function preventPollution(req, _res, next) {
  if (req.body) {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      delete req.body[key];
    }
  }
  next();
}

// ── 11. Extra headers ─────────────────────────────────────────────
function extraHeaders(_req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

// ── 12. Security error handler ────────────────────────────────────
function securityErrorHandler(err, _req, res, next) {
  if (err && err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  next(err);
}

const active = [
  helmet      && 'helmet',
  rateLimit   && 'rate-limit',
  slowDown    && 'slow-down',
  compression && 'compression',
].filter(Boolean);
if (active.length) {
  console.log(`🔒 Security active: ${active.join(', ')}`);
} else {
  console.warn('⚠️  Security packages not installed. Run: npm install');
}

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  compressionMiddleware,
  jsonLimit,
  urlencodedLimit,
  globalLimiter,
  speedLimiter,
  authLimiter,
  registerLimiter,
  sanitiseInput,
  preventPollution,
  extraHeaders,
  securityErrorHandler,
};
