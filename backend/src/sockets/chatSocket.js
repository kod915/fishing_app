const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret } = require('../config/env');
const { VERIFY_OPTIONS } = require('../middleware/authMiddleware');
const { checkChatAccess } = require('../services/chatAccess');
const { parsePositiveInt } = require('../utils/validation');

// Limit wiadomości na jedno połączenie: 5 wiadomości w oknie 5 sekund
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 5000;
const MAX_CONTENT = 1000;

module.exports = (io) => {
    // Autoryzacja połączenia tym samym JWT co REST API
    io.use((socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(new Error('Brak tokena autoryzacyjnego'));
        jwt.verify(token, jwtSecret, VERIFY_OPTIONS, (err, user) => {
            if (err) return next(new Error('Nieprawidłowy lub wygasły token'));
            socket.user = user;
            next();
        });
    });

    io.on('connection', (socket) => {
        // Token jest sprawdzany tylko przy połączeniu – rozłączamy, gdy wygaśnie.
        // Klient łączy się ponownie z odświeżonym tokenem.
        const msLeft = (socket.user.exp || 0) * 1000 - Date.now();
        const expiryTimer = setTimeout(() => {
            socket.emit('auth:expired');
            socket.disconnect(true);
        }, Math.max(msLeft, 0));

        const sendTimestamps = [];
        const isThrottled = () => {
            const now = Date.now();
            while (sendTimestamps.length && now - sendTimestamps[0] > SEND_WINDOW_MS) sendTimestamps.shift();
            if (sendTimestamps.length >= SEND_LIMIT) return true;
            sendTimestamps.push(now);
            return false;
        };

        socket.on('disconnect', () => clearTimeout(expiryTimer));

        socket.on('chat:join', async (tournamentId, ack) => {
            try {
                const id = parsePositiveInt(tournamentId);
                if (!id) return ack && ack({ ok: false, message: 'Nieprawidłowy identyfikator zawodów.' });

                const access = await checkChatAccess(socket.user, id);
                if (access === 'not_found') return ack && ack({ ok: false, message: 'Zawody nie istnieją.' });
                if (access === 'forbidden') return ack && ack({ ok: false, message: 'Dołącz do zawodów, aby korzystać z czatu.' });

                socket.join(`tournament:${id}`);
                ack && ack({ ok: true });
            } catch (e) {
                console.error('chat:join', e);
                ack && ack({ ok: false, message: 'Błąd dołączania do czatu' });
            }
        });

        socket.on('chat:send', async ({ tournamentId, content } = {}, ack) => {
            const id = parsePositiveInt(tournamentId);
            if (!id) return ack && ack({ ok: false, message: 'Nieprawidłowy identyfikator zawodów.' });
            const room = `tournament:${id}`;
            const text = String(content || '').trim().slice(0, MAX_CONTENT);

            if (!text) return ack && ack({ ok: false, message: 'Pusta wiadomość' });
            if (!socket.rooms.has(room)) return ack && ack({ ok: false, message: 'Najpierw dołącz do czatu' });
            if (isThrottled()) return ack && ack({ ok: false, message: 'Za dużo wiadomości – odczekaj chwilę.' });

            try {
                const r = await db.query(
                    `INSERT INTO chat_messages (tournament_id, user_id, content)
                     VALUES ($1, $2, $3) RETURNING id, created_at`,
                    [id, socket.user.id, text]
                );
                io.to(room).emit('chat:message', {
                    id: r.rows[0].id,
                    tournament_id: id,
                    user_id: socket.user.id,
                    full_name: socket.user.full_name,
                    role: socket.user.role,
                    content: text,
                    created_at: r.rows[0].created_at,
                });
                ack && ack({ ok: true });
            } catch (e) {
                console.error('chat:send', e);
                ack && ack({ ok: false, message: 'Błąd zapisu wiadomości' });
            }
        });
    });
};
