// Centralna konfiguracja ze zmiennych środowiskowych.
// W produkcji brak krytycznych wartości przerywa start aplikacji (fail fast),
// zamiast cicho używać słabych domyślnych wartości deweloperskich.
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-not-for-production');
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET is missing or shorter than 32 characters');
}

const databaseUrl = process.env.DATABASE_URL || (isProd ? '' : 'postgres://postgres:1234@localhost:5432/fishing_db');
if (isProd && !databaseUrl) {
  throw new Error('DATABASE_URL is required in production');
}

// Lista dozwolonych originów (CSV). Pusta lista = brak dostępu cross-origin
// (produkcja: frontend serwowany z tego samego origin przez nginx / load balancer).
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

module.exports = {
  isProd,
  port: Number(process.env.PORT || 5000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  databaseUrl,
  redisUrl: process.env.REDIS_URL || '',
  corsOrigins,
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),
  pgPoolMax: Number(process.env.PG_POOL_MAX || 8),
  pgSslCa: process.env.PG_SSL_CA || '',
  // TLS do bazy: domyślnie włączone w produkcji. PG_SSL=disable tylko dla lokalnego
  // compose (Postgres w tej samej sieci Dockera bez certyfikatu) – nigdy w chmurze.
  pgSsl: process.env.PG_SSL ? process.env.PG_SSL !== 'disable' : isProd,
};
