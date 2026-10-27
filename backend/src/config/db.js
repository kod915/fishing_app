const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fishing_db'
});

pool.on('connect', () => {
  console.log('Połączono z bazą danych PostgreSQL');
});

/**
 * Wykonuje `fn(client)` w transakcji. Commit przy sukcesie, rollback przy wyjątku.
 * Używane tam, gdzie trzeba odczytać i zapisać atomowo (np. zapisy na zawody).
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
  pool,
};
