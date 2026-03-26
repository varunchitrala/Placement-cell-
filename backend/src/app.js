const express = require('express');
const path    = require('path');

const {
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
} = require('./middleware/security');

const app = express();

app.set('trust proxy', 1);

// Security headers
app.use(helmetMiddleware);
app.use(extraHeaders);

// CORS
app.use(corsMiddleware);

// Compression
app.use(compressionMiddleware);

// Body parsing
app.use(express.json({ limit: jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: urlencodedLimit }));

// Input sanitisation
app.use(sanitiseInput);
app.use(preventPollution);

// Rate limiting
app.use(globalLimiter);
app.use(speedLimiter);

// ── Serve frontend static files ──────────────────────────────────
// HTML files: NO cache — always serve fresh so fixes reach users instantly
app.use(express.static(path.join(__dirname, '../../Frontend'), {
  etag: false,
  lastModified: false,
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html')) {
      // Never cache HTML
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else if (filePath.match(/\.(css|js)$/)) {
      // CSS/JS: short cache
      res.setHeader('Cache-Control', 'public, max-age=300');
    } else if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|webp)$/)) {
      // Images: longer cache
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: 'PostgreSQL/Neon', ts: new Date().toISOString() });
});

// API Routes
app.use('/api/auth/register-student', registerLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/student',   require('./routes/student'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/recruiter', require('./routes/recruiter'));
app.use('/api/coordinator', require('./routes/recruiter'));
app.use('/api/notice',    require('./routes/notice'));

// 404 for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// SPA fallback — also no cache
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, '../../Frontend/index.html'));
});

// Error handlers
app.use(securityErrorHandler);
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

module.exports = app;
