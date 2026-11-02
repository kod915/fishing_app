const fs = require('fs');
const { Pool } = require('pg');
const { databaseUrl, pgPoolMax, pgSslCa, pgSsl } = require('./env');

// TLS do bazy w produkcji (Azure PostgreSQL wymusza SSL). Nie wyłączamy weryfikacji
// certyfikatu – jeśli Node nie zna CA serwera, podaj ścieżkę do bundla w PG_SSL_CA.
const ssl = pgSsl
  ? { rejectUnauthorized: true, ...(pgSslCa ? { ca: fs.readFileSync(pgSslCa, 'utf8') } : {}) }
  : false;

const pool = new Pool({
  connectionString: databaseUrl,
  ssl,
  // replik x max musi zostać poniżej max_connections serwera
  max: pgPoolMax,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,
});

pool.on('connect', () => {
  console.log('Połączono z bazą danych PostgreSQL');
});
pool.on('error', (err) => {
  console.error('Błąd puli połączeń PostgreSQL:', err.message);
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
  getClient: () => pool.connect(),
  withTransaction,
  pool,
};
