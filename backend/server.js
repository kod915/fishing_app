const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { Server } = require('socket.io');

const env = require('./src/config/env');
const db = require('./src/config/db');
const { connectRedis, createSocketAdapter, getRedisClient, closeRedis } = require('./src/config/redis');

const authRoutes = require('./src/routes/authRoutes');
const tournamentRoutes = require('./src/routes/tournamentRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');
const catchRoutes = require('./src/routes/catchRoutes');
const chatRoutes = require('./src/routes/chatRoutes');

// Pusta lista originów = brak cross-origin (frontend za tym samym nginx / LB).
// Nigdy nie przechodzimy na `origin: true`, które odbijałoby dowolny origin.
const corsOptions = { origin: env.corsOrigins, credentials: true };

/** Store rate limitera: Redis (współdzielony między replikami) albo pamięć (dev). */
const limiterStore = (prefix) => {
  const client = getRedisClient();
  return client
    ? new RedisStore({ prefix, sendCommand: (...args) => client.sendCommand(args) })
    : undefined;
};

function buildApp() {
  const app = express();

  // Za load balancerem / reverse proxy: poprawne req.ip (rate limiting!), req.protocol
  app.set('trust proxy', env.trustProxyHops);
  app.disable('x-powered-by');

  // CSP i HSTS wystawia nginx na brzegu – jeden zestaw nagłówków, bez konfliktu
  // max-age przy proxy /api. Helmet zostawia resztę (nosniff, frameguard, Referrer-Policy).
  app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  // Health-checki dla load balancera / orkiestratora (poza rate limitem)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  app.get('/ready', async (req, res) => {
    const checks = {};
    try {
      await db.query('SELECT 1');
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
    }
    const redis = getRedisClient();
    if (env.redisUrl) {
      try {
        checks.redis = redis && (await redis.ping()) === 'PONG' ? 'ok' : 'error';
      } catch {
        checks.redis = 'error';
      }
    }
    const ready = Object.values(checks).every((v) => v === 'ok');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', ...checks });
  });

  const apiLimiter = rateLimit({
    windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
    store: limiterStore('rl:api:'),
    message: { message: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.' },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    store: limiterStore('rl:auth:'),
    // odświeżanie sesji jest rutynowe – limitujemy tylko logowanie i rejestrację
    skip: (req) => req.path === '/refresh' || req.path === '/logout',
    message: { message: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/catches', catchRoutes);
  app.use('/api/chat', chatRoutes);

  app.get('/', (req, res) => {
    res.send('API Aplikacji do Zarządzania Zawodami Wędkarskimi działa poprawnie.');
  });

  app.use((req, res) => res.status(404).json({ message: 'Nie znaleziono.' }));

  return app;
}

(async () => {
  // Redis najpierw – rate limiter i adapter Socket.IO potrzebują połączenia przy budowie aplikacji.
  await connectRedis();

  const app = buildApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOptions,
    // Ogranicza rozmiar pojedynczej ramki – wiadomości czatu mają limit 1000 znaków
    maxHttpBufferSize: 10_000,
  });

  const adapter = createSocketAdapter();
  if (adapter) {
    io.adapter(adapter);
    console.log('Socket.IO: adapter Redis aktywny');
  } else {
    console.log('Socket.IO: adapter in-memory (brak REDIS_URL)');
  }
  require('./src/sockets/chatSocket')(io);

  const shutdown = (signal) => {
    console.log(`${signal} – zamykanie serwera...`);
    io.close();
    server.close(async () => {
      await closeRedis();
      await db.pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(env.port, () => {
    console.log(`Serwer uruchomiony na porcie ${env.port} (${env.isProd ? 'production' : 'development'})`);
  });
})().catch((err) => {
  console.error('Nie udało się uruchomić serwera:', err.message);
  process.exit(1);
});
