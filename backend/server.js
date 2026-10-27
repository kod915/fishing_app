const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const db = require('./src/config/db');
const { createSocketAdapter } = require('./src/config/redis');

const authRoutes = require('./src/routes/authRoutes');
const tournamentRoutes = require('./src/routes/tournamentRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');
const catchRoutes = require('./src/routes/catchRoutes');
const chatRoutes = require('./src/routes/chatRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Lista dozwolonych originów (CSV), np. "https://aaa.domen.pl,http://localhost:5173".
// Pusta wartość = ten sam origin (frontend serwowany zza tego samego LB / nginx).
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const corsOptions = { origin: corsOrigins.length ? corsOrigins : true, credentials: true };

// Za load balancerem / reverse proxy: poprawne req.ip, req.protocol, req.secure
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

app.use(cors(corsOptions));
app.use(express.json());

// Health-checki dla load balancera / orkiestratora
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', db: 'error' });
  }
});

// Trasy API
app.use('/api/auth', authRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/catches', catchRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
  res.send('API Aplikacji do Zarządzania Zawodami Wędkarskimi działa poprawnie.');
});

// Socket.IO działa na tym samym serwerze HTTP co Express
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
require('./src/sockets/chatSocket')(io);

const shutdown = (signal) => {
  console.log(`${signal} – zamykanie serwera...`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  // Przy wielu instancjach backendu (autoscaling) wiadomości czatu są rozgłaszane
  // przez Redis. Bez REDIS_URL działa domyślny adapter in-memory (jedna instancja).
  const adapter = await createSocketAdapter();
  if (adapter) {
    io.adapter(adapter);
    console.log('Socket.IO: adapter Redis aktywny');
  } else {
    console.log('Socket.IO: adapter in-memory (brak REDIS_URL)');
  }

  server.listen(PORT, () => {
    console.log(`Serwer uruchomiony na porcie ${PORT}`);
  });
})();
