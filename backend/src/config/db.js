const { neon, Pool } = require('@neondatabase/serverless');
require('dotenv').config();

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
