const db = require('../config/db');
const { parsePositiveInt, parseText, HttpError, handleError } = require('../utils/validation');
const { canViewTournament } = require('../services/tournamentAccess');

// Górna granica wagi pojedynczej ryby (200 kg) – chroni przed literówkami typu "25000000".
const MAX_WEIGHT_GRAMS = 200000;

const parseWeight = (value) => {
  const w = parsePositiveInt(value);
  return w && w <= MAX_WEIGHT_GRAMS ? w : null;
};
const weightMessage = `Waga musi być liczbą całkowitą od 1 do ${MAX_WEIGHT_GRAMS} gramów.`;

exports.addCatch = async (req, res) => {
  const tournamentId = parsePositiveInt(req.body.tournament_id);
  const userId = parsePositiveInt(req.body.user_id);
  const species = parseText(req.body.species, 100);
  const weightGrams = parseWeight(req.body.weight_grams);
  const registeredBy = req.user.id;

  if (!tournamentId) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  if (!userId) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodnika.' });
  if (!species) return res.status(400).json({ message: 'Podaj gatunek ryby (maks. 100 znaków).' });
  if (!weightGrams) return res.status(400).json({ message: weightMessage });

  try {
    const result = await db.withTransaction(async (client) => {
      const tRes = await client.query('SELECT status FROM tournaments WHERE id = $1', [tournamentId]);
      const tournament = tRes.rows[0];
      if (!tournament) throw new HttpError(404, 'Zawody nie istnieją.');
      if (tournament.status !== 'IN_PROGRESS') {
        throw new HttpError(409, 'Połowy można rejestrować tylko w trakcie trwania zawodów.');
      }

      const reg = await client.query(
        'SELECT 1 FROM registrations WHERE tournament_id = $1 AND user_id = $2',
        [tournamentId, userId]
      );
      if (reg.rows.length === 0) {
        throw new HttpError(409, 'Ten zawodnik nie jest zapisany na te zawody.');
      }

      const ins = await client.query(
        `INSERT INTO catches (tournament_id, user_id, species, weight_grams, registered_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tournamentId, userId, species, weightGrams, registeredBy]
      );
      return ins.rows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Błąd dodawania połowu');
  }
};

/** Lista połowów w zawodach (dla sędziów – do korekt). Bez usuniętych. */
exports.listByTournament = async (req, res) => {
  const tournamentId = parsePositiveInt(req.params.tournamentId);
  if (!tournamentId) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });

  try {
    const { access } = await canViewTournament(req.user, tournamentId);
    if (access !== 'ok') return res.status(404).json({ message: 'Zawody nie istnieją.' });

    const result = await db.query(
      `SELECT c.id, c.tournament_id, c.user_id, u.full_name, c.species, c.weight_grams,
              c.registered_by, c.created_at, c.updated_at
       FROM catches c
       JOIN users u ON u.id = c.user_id
       WHERE c.tournament_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
      [tournamentId]
    );
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Błąd pobierania połowów');
  }
};

/** Korekta połowu (literówka w wadze / gatunku). Zapisujemy kto i kiedy poprawił. */
exports.updateCatch = async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'Nieprawidłowy identyfikator połowu.' });

  const fields = [];
  const values = [];
  if (req.body.species !== undefined) {
    const species = parseText(req.body.species, 100);
    if (!species) return res.status(400).json({ message: 'Podaj gatunek ryby (maks. 100 znaków).' });
    values.push(species); fields.push(`species = $${values.length}`);
  }
  if (req.body.weight_grams !== undefined) {
    const w = parseWeight(req.body.weight_grams);
    if (!w) return res.status(400).json({ message: weightMessage });
    values.push(w); fields.push(`weight_grams = $${values.length}`);
  }
  if (fields.length === 0) return res.status(400).json({ message: 'Brak danych do zmiany.' });

  try {
    const result = await db.withTransaction(async (client) => {
      const cur = await client.query(
        `SELECT c.id, t.status FROM catches c JOIN tournaments t ON t.id = c.tournament_id
         WHERE c.id = $1 AND c.deleted_at IS NULL FOR UPDATE OF c`,
        [id]
      );
      if (cur.rows.length === 0) throw new HttpError(404, 'Połów nie istnieje.');
      if (!['IN_PROGRESS', 'FINISHED'].includes(cur.rows[0].status)) {
        throw new HttpError(409, 'Korekta możliwa tylko dla trwających lub zakończonych zawodów.');
      }
      values.push(req.user.id, id);
      const upd = await client.query(
        `UPDATE catches SET ${fields.join(', ')}, updated_at = now(), updated_by = $${values.length - 1}
         WHERE id = $${values.length} RETURNING *`,
        values
      );
      return upd.rows[0];
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Błąd korekty połowu');
  }
};

/** Usunięcie połowu – miękkie (deleted_at), żeby zostawić ślad do audytu. */
exports.deleteCatch = async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'Nieprawidłowy identyfikator połowu.' });

  try {
    const r = await db.query(
      `UPDATE catches SET deleted_at = now(), deleted_by = $1
       WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.user.id, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Połów nie istnieje.' });
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Błąd usuwania połowu');
  }
};

exports.getLeaderboard = async (req, res) => {
  const tournamentId = parsePositiveInt(req.params.tournamentId);
  if (!tournamentId) {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  }

  try {
    // Ranking jest publiczny, ale wersji roboczych nie ujawniamy nikomu poza organizatorami
    const { access } = await canViewTournament(req.user, tournamentId);
    if (access !== 'ok') return res.status(404).json({ message: 'Zawody nie istnieją.' });

    // Kryteria klasyfikacji: łączna waga, potem największa ryba, potem liczba ryb.
    // RANK() daje miejsca ex aequo przy pełnym remisie (1, 1, 3), a dodatkowe
    // sortowanie po nazwisku i id zapewnia stabilną, powtarzalną kolejność wierszy.
    const query = `
      WITH scores AS (
        SELECT
          u.id AS user_id,
          u.full_name,
          r.sector,
          r.spot_number,
          COALESCE(SUM(c.weight_grams), 0)::int AS total_weight,
          COUNT(c.id)::int AS fish_count,
          COALESCE(MAX(c.weight_grams), 0)::int AS biggest_fish
        FROM registrations r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN catches c ON c.tournament_id = r.tournament_id AND c.user_id = r.user_id
                            AND c.deleted_at IS NULL
        WHERE r.tournament_id = $1
        GROUP BY u.id, u.full_name, r.sector, r.spot_number
      )
      SELECT
        RANK() OVER (ORDER BY total_weight DESC, biggest_fish DESC, fish_count DESC)::int AS rank,
        *
      FROM scores
      ORDER BY rank, full_name, user_id;
    `;
    const result = await db.query(query, [tournamentId]);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Błąd pobierania wyników');
  }
};
