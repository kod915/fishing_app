const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const tournamentRoutes = require('./src/routes/tournamentRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');
const catchRoutes = require('./src/routes/catchRoutes');
const chatRoutes = require('./src/routes/chatRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
const io = new Server(server, { cors: { origin: 'http://localhost:5173' } });
require('./src/sockets/chatSocket')(io);

server.listen(PORT, () => {
  console.log(`Serwer uruchomiony na porcie ${PORT}`);
});