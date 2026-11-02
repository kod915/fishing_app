const db = require('../config/db');

const isOrganizer = (user) => !!user && (user.role === 'ADMIN' || user.role === 'JUDGE');

/**
 * Czy użytkownik (lub gość, gdy user = undefined) może oglądać dane zawodów.
 * Wersje robocze (DRAFT) widzą wyłącznie organizatorzy – także po id, nie tylko na liście.
 * Zwraca { access: 'ok' | 'not_found' | 'forbidden', tournament }.
 */
async function canViewTournament(user, tournamentId, client = db) {
  const r = await client.query(
    'SELECT id, status, max_participants, spots_per_sector FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  const tournament = r.rows[0];
  if (!tournament) return { access: 'not_found', tournament: null };
  if (tournament.status === 'DRAFT' && !isOrganizer(user)) {
    // Dla nie-organizatora wersja robocza "nie istnieje" – nie zdradzamy jej obecności
    return { access: 'not_found', tournament: null };
  }
  return { access: 'ok', tournament };
}

module.exports = { isOrganizer, canViewTournament };
