const { neon, neonConfig, Pool } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

// Required for Node.js runtimes (Railway, Render, etc.)
// The Neon serverless driver uses WebSockets, which aren't built into Node.js
neonConfig.webSocketConstructor = ws;

// Tagged-template sql helper (for simple one-off queries)
const sql = neon(process.env.DATABASE_URL);

// pg-compatible Pool (used by all controllers via pool.query)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => console.error('⚡ Neon pool error:', err));

module.exports = {
  // Standard parameterized query — used throughout all controllers
  query: (text, params) => pool.query(text, params),
  // Raw tagged-template sql for simple use cases
  sql,
  pool
};
