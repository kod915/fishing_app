const db = require('../config/db');
const { canAccessChat } = require('../services/chatAccess');

exports.getHistory = async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    try {
        if (!(await canAccessChat(req.user, tournamentId))) {
            return res.status(403).json({ message: 'Dołącz do zawodów, aby korzystać z czatu.' });
        }
        const result = await db.query(
            `SELECT m.id, m.tournament_id, m.user_id, m.content, m.created_at,
              u.full_name, u.role
       FROM chat_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.tournament_id = $1
       ORDER BY m.id DESC
       LIMIT 100`,
            [tournamentId]
        );
        res.json(result.rows.reverse());
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania wiadomości', error: err.message });
    }
};