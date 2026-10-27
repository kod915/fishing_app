const db = require('../config/db');
const { checkChatAccess } = require('../services/chatAccess');
const { parsePositiveInt, parseNonNegativeInt, handleError } = require('../utils/validation');

const HISTORY_LIMIT = 100;

/**
 * GET /api/chat/:tournamentId            -> ostatnie 100 wiadomości
 * GET /api/chat/:tournamentId?after=<id> -> wiadomości nowsze niż <id> (dociąganie po rozłączeniu)
 */
exports.getHistory = async (req, res) => {
    const tournamentId = parsePositiveInt(req.params.tournamentId);
    if (!tournamentId) {
        return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
    }
    const after = req.query.after !== undefined ? parseNonNegativeInt(req.query.after) : null;
    if (req.query.after !== undefined && after === null) {
        return res.status(400).json({ message: 'Parametr "after" musi być nieujemną liczbą całkowitą.' });
    }

    try {
        const access = await checkChatAccess(req.user, tournamentId);
        if (access === 'not_found') return res.status(404).json({ message: 'Zawody nie istnieją.' });
        if (access === 'forbidden') return res.status(403).json({ message: 'Dołącz do zawodów, aby korzystać z czatu.' });

        const params = [tournamentId];
        let afterClause = '';
        if (after !== null) {
            params.push(after);
            afterClause = `AND m.id > $2`;
        }

        const result = await db.query(
            `SELECT m.id, m.tournament_id, m.user_id, m.content, m.created_at,
                    u.full_name, u.role
             FROM chat_messages m
             JOIN users u ON u.id = m.user_id
             WHERE m.tournament_id = $1 ${afterClause}
             ORDER BY m.id DESC
             LIMIT ${HISTORY_LIMIT}`,
            params
        );
        res.json(result.rows.reverse());
    } catch (err) {
        handleError(res, err, 'Błąd pobierania wiadomości');
    }
};
