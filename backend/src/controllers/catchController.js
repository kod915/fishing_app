const db = require('../config/db');
const { parsePositiveInt, parseText, HttpError, handleError } = require('../utils/validation');

// Górna granica wagi pojedynczej ryby (200 kg) – chroni przed literówkami typu "25000000".
const MAX_WEIGHT_GRAMS = 200000;

exports.addCatch = async (req, res) => {
  const tournamentId = parsePositiveInt(req.body.tournament_id);
  const userId = parsePositiveInt(req.body.user_id);
  const species = parseText(req.body.species, 100);
  const weightGrams = parsePositiveInt(req.body.weight_grams);
  const registeredBy = req.user.id;

  if (!tournamentId) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  if (!userId) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodnika.' });
  if (!species) return res.status(400).json({ message: 'Podaj gatunek ryby (maks. 100 znaków).' });
  if (!weightGrams || weightGrams > MAX_WEIGHT_GRAMS) {
    return res.status(400).json({ message: `Waga musi być liczbą całkowitą od 1 do ${MAX_WEIGHT_GRAMS} gramów.` });
  }

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

exports.getLeaderboard = async (req, res) => {
  const tournamentId = parsePositiveInt(req.params.tournamentId);
  if (!tournamentId) {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  }

  try {
    const exists = await db.query('SELECT 1 FROM tournaments WHERE id = $1', [tournamentId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ message: 'Zawody nie istnieją.' });
    }

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
