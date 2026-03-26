const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const app           = require('./src/app');
const runMigrations = require('./src/migrate');

const PORT = process.env.PORT || 5000;

// ── Prevent server crash from unhandled promise rejections ───────
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled Rejection:', reason);
  // Log but don't crash — keep serving 1500 students
});

// ── Prevent server crash from uncaught exceptions ────────────────
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught Exception:', err.message);
  // Only exit on truly fatal errors (not ECONNRESET, EPIPE etc.)
  if (!['ECONNRESET', 'EPIPE', 'ENOTFOUND'].includes(err.code)) {
    process.exit(1);
  }
});

// ── Graceful shutdown on SIGTERM (Render / Railway deploy) ───────
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received — shutting down gracefully');
  process.exit(0);
});

// ── Run migrations then start ─────────────────────────────────────
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Vidya Sethu Server → http://localhost:${PORT}`);
      console.log(`📦 Database: PostgreSQL / Neon`);
      console.log(`🔒 Security: Helmet · CORS · Rate Limiting · Input Sanitisation`);
    });
  })
  .catch((err) => {
    console.error('❌ Migration failed — server not started:', err.message);
    process.exit(1);
  });
