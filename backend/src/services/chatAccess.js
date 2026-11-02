const db = require('../config/db');
const { isOrganizer, canViewTournament } = require('./tournamentAccess');

/**
 * Czy użytkownik może korzystać z czatu zawodów.
 * Zwraca: 'ok' | 'not_found' | 'forbidden'.
 * Organizatorzy mają dostęp do każdego istniejącego czatu; wędkarz tylko jeśli jest zapisany.
 */
exports.checkChatAccess = async (user, tournamentId) => {
    const { access } = await canViewTournament(user, tournamentId);
    if (access !== 'ok') return 'not_found';
    if (isOrganizer(user)) return 'ok';

    const r = await db.query(
        'SELECT 1 FROM registrations WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
    );
    return r.rows.length > 0 ? 'ok' : 'forbidden';
};

// Zachowane dla zgodności: true tylko gdy dostęp jest pełny
exports.canAccessChat = async (user, tournamentId) =>
    (await exports.checkChatAccess(user, tournamentId)) === 'ok';
