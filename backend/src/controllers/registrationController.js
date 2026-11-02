const db = require('../config/db');
const { parsePositiveInt, HttpError, handleError } = require('../utils/validation');
const { isOrganizer, canViewTournament } = require('../services/tournamentAccess');

/**
 * Numer porządkowy stanowiska (0-based) -> { sector, spot_number }.
 * Sektory: A, B, C, ... po `spotsPerSector` stanowisk każdy.
 */
const spotFromIndex = (index, spotsPerSector) => ({
  sector: `Sektor ${String.fromCharCode(65 + Math.floor(index / spotsPerSector))}`,
  spot_number: (index % spotsPerSector) + 1,
});

/**
 * Pierwsze wolne stanowisko. Liczymy po faktycznie zajętych miejscach, a nie po COUNT(*),
 * dzięki czemu luki po wypisanych/usuniętych uczestnikach są ponownie wykorzystywane.
 */
const findFreeSpot = (taken, maxParticipants, spotsPerSector) => {
  const takenKeys = new Set(taken.map((r) => `${r.sector}#${r.spot_number}`));
  for (let i = 0; i < maxParticipants; i++) {
    const spot = spotFromIndex(i, spotsPerSector);
    if (!takenKeys.has(`${spot.sector}#${spot.spot_number}`)) return spot;
  }
  return null;
};

exports.registerUser = async (req, res) => {
  const tournamentId = parsePositiveInt(req.body.tournament_id);
  const userId = req.user.id;

  if (!tournamentId) {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  }

  try {
    const registration = await db.withTransaction(async (client) => {
      // FOR UPDATE blokuje wiersz turnieju na czas transakcji – równoległe zapisy
      // na te same zawody wykonają się sekwencyjnie i zobaczą aktualny stan miejsc.
      const tRes = await client.query(
        `SELECT id, status, max_participants, spots_per_sector
         FROM tournaments WHERE id = $1 FOR UPDATE`,
        [tournamentId]
      );
      const tournament = tRes.rows[0];
      if (!tournament || (tournament.status === 'DRAFT' && !isOrganizer(req.user))) {
        throw new HttpError(404, 'Zawody nie istnieją.');
      }
      if (tournament.status !== 'OPEN') {
        throw new HttpError(409, 'Zapisy na te zawody nie są otwarte.');
      }

      const taken = await client.query(
        'SELECT user_id, sector, spot_number FROM registrations WHERE tournament_id = $1',
        [tournamentId]
      );
      if (taken.rows.some((r) => r.user_id === userId)) {
        throw new HttpError(409, 'Jesteś już zapisany na te zawody.');
      }
      if (taken.rows.length >= tournament.max_participants) {
        throw new HttpError(409, 'Brak wolnych miejsc – limit uczestników został osiągnięty.');
      }

      const spot = findFreeSpot(taken.rows, tournament.max_participants, tournament.spots_per_sector);
      if (!spot) throw new HttpError(409, 'Brak wolnych stanowisk.');

      const ins = await client.query(
        `INSERT INTO registrations (tournament_id, user_id, sector, spot_number)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [tournamentId, userId, spot.sector, spot.spot_number]
      );
      return ins.rows[0];
    });

    res.status(201).json(registration);
  } catch (err) {
    if (err.code === '23505') {
      // Różne naruszenia unikalności to różne problemy – nie zgłaszamy wszystkich jako "już zapisany"
      if (err.constraint === 'unique_user_tournament') {
        return res.status(409).json({ message: 'Jesteś już zapisany na te zawody.' });
      }
      if (err.constraint === 'unique_tournament_spot') {
        console.error('Kolizja stanowiska mimo blokady FOR UPDATE:', err.detail);
        return res.status(409).json({ message: 'Stanowisko zostało właśnie zajęte. Spróbuj ponownie.' });
      }
    }
    handleError(res, err, 'Błąd rejestracji na zawody');
  }
};

/** Wypisanie się z zawodów – możliwe tylko, gdy zapisy są jeszcze otwarte. */
exports.withdraw = async (req, res) => {
  const tournamentId = parsePositiveInt(req.params.tournamentId);
  // Organizator może wypisać wskazanego uczestnika; wędkarz tylko siebie
  const targetUserId = req.params.userId ? parsePositiveInt(req.params.userId) : req.user.id;

  if (!tournamentId || !targetUserId) {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator.' });
  }
  if (targetUserId !== req.user.id && !isOrganizer(req.user)) {
    return res.status(403).json({ message: 'Brak uprawnień do wykonania tej operacji' });
  }

  try {
    await db.withTransaction(async (client) => {
      const tRes = await client.query('SELECT status FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
      const tournament = tRes.rows[0];
      if (!tournament) throw new HttpError(404, 'Zawody nie istnieją.');
      if (tournament.status !== 'OPEN') {
        throw new HttpError(409, 'Wypisanie możliwe tylko w czasie otwartych zapisów.');
      }
      const del = await client.query(
        'DELETE FROM registrations WHERE tournament_id = $1 AND user_id = $2 RETURNING id',
        [tournamentId, targetUserId]
      );
      if (del.rows.length === 0) throw new HttpError(404, 'Brak takiej rejestracji.');
    });
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Błąd wypisywania z zawodów');
  }
};

exports.getByTournament = async (req, res) => {
  const tournamentId = parsePositiveInt(req.params.tournamentId);
  if (!tournamentId) {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  }

  // Adresy e-mail widzą tylko organizatorzy; wędkarze dostają listę nazwisk i stanowisk.
  const emailColumn = isOrganizer(req.user) ? ', u.email' : '';

  try {
    const { access } = await canViewTournament(req.user, tournamentId);
    if (access !== 'ok') return res.status(404).json({ message: 'Zawody nie istnieją.' });

    const result = await db.query(
      `SELECT r.id, r.tournament_id, r.user_id, r.sector, r.spot_number, r.registered_at,
              u.full_name${emailColumn}
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.tournament_id = $1
       ORDER BY r.sector, r.spot_number`,
      [tournamentId]
    );
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Błąd pobierania rejestracji');
  }
};
