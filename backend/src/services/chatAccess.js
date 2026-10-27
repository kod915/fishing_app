const db = require('../config/db');

// Organizatorzy zawsze; wędkarz tylko jeśli zapisany na dany turniej
exports.canAccessChat = async (user, tournamentId) => {
    if (user.role === 'ADMIN' || user.role === 'JUDGE') return true;
    const r = await db.query(
        'SELECT 1 FROM registrations WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, user.id]
    );
    return r.rows.length > 0;
};