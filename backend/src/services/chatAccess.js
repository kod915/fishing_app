const db = require('../config/db');

/**
 * Czy użytkownik może korzystać z czatu zawodów.
 * Zwraca: 'ok' | 'not_found' | 'forbidden'.
 * Organizatorzy mają dostęp do każdego istniejącego czatu; wędkarz tylko jeśli jest zapisany.
 */
exports.checkChatAccess = async (user, tournamentId) => {
    const t = await db.query('SELECT 1 FROM tournaments WHERE id = $1', [tournamentId]);
    if (t.rows.length === 0) return 'not_found';

    if (user.role === 'ADMIN' || user.role === 'JUDGE') return 'ok';

    const r = await db.query(
        'SELECT 1 FROM registrations WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
    );
    return r.rows.length > 0 ? 'ok' : 'forbidden';
};

// Zachowane dla zgodności: true tylko gdy dostęp jest pełny
exports.canAccessChat = async (user, tournamentId) =>
    (await exports.checkChatAccess(user, tournamentId)) === 'ok';
