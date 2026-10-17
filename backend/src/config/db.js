const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fishing_db'
});

pool.on('connect', () => {
  console.log('Połączono z bazą danych PostgreSQL');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};