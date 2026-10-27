const db = require('../config/db');
const { parsePositiveInt, parseText, parseDate, handleError } = require('../utils/validation');

const STATUSES = ['DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED'];

// Dozwolone przejścia statusów. FINISHED jest stanem końcowym.
// OPEN -> DRAFT pozwala wycofać przedwcześnie opublikowane zawody.
const TRANSITIONS = {
  DRAFT: ['OPEN'],
  OPEN: ['IN_PROGRESS', 'DRAFT'],
  IN_PROGRESS: ['FINISHED'],
  FINISHED: [],
};

const isOrganizer = (user) => !!user && (user.role === 'ADMIN' || user.role === 'JUDGE');

exports.getAll = async (req, res) => {
  // Wersje robocze (DRAFT) widzą tylko organizatorzy; goście i wędkarze – opublikowane zawody.
  const whereClause = isOrganizer(req.user) ? '' : `WHERE t.status <> 'DRAFT'`;
  // is_registered: czy zalogowany użytkownik jest zapisany (dla gościa zawsze false)
  const userId = req.user ? req.user.id : null;
  try {
    const result = await db.query(`
      SELECT t.*,
             COUNT(r.id)::int AS registered_count,
             COALESCE(BOOL_OR(r.user_id = $1), false) AS is_registered
      FROM tournaments t
      LEFT JOIN registrations r ON t.id = r.tournament_id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.event_date DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Błąd pobierania zawodów');
  }
};

exports.create = async (req, res) => {
  const name = parseText(req.body.name, 255);
  const location = parseText(req.body.location, 255);
  const eventDate = parseDate(req.body.event_date);
  // `??` zamiast `||`: brak pola -> domyślna wartość, ale podane 0 nie jest cicho zamieniane na 30
  const maxParticipants = parsePositiveInt(req.body.max_participants ?? 30);
  const spotsPerSector = parsePositiveInt(req.body.spots_per_sector ?? 10);
  // Nowe zawody domyślnie są wersją roboczą; admin może od razu opublikować (OPEN).
  const status = req.body.status ?? 'DRAFT';

  if (!name) return res.status(400).json({ message: 'Podaj nazwę zawodów (maks. 255 znaków).' });
  if (!location) return res.status(400).json({ message: 'Podaj lokalizację zawodów.' });
  if (!eventDate) return res.status(400).json({ message: 'Data musi mieć format RRRR-MM-DD.' });
  if (!maxParticipants) return res.status(400).json({ message: 'Limit uczestników musi być dodatnią liczbą całkowitą.' });
  if (!spotsPerSector) return res.status(400).json({ message: 'Liczba stanowisk w sektorze musi być dodatnią liczbą całkowitą.' });
  if (!['DRAFT', 'OPEN'].includes(status)) {
    return res.status(400).json({ message: 'Nowe zawody mogą mieć status DRAFT lub OPEN.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO tournaments (name, location, event_date, max_participants, spots_per_sector, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, location, eventDate, maxParticipants, spotsPerSector, status, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Błąd tworzenia zawodów');
  }
};

exports.updateStatus = async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  const { status } = req.body;

  if (!id) return res.status(400).json({ message: 'Nieprawidłowy identyfikator zawodów.' });
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ message: `Nieprawidłowy status. Dozwolone: ${STATUSES.join(', ')}.` });
  }

  try {
    const current = await db.query('SELECT status FROM tournaments WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Zawody nie istnieją.' });
    }
    const from = current.rows[0].status;
    if (from === status) {
      return res.status(409).json({ message: `Zawody mają już status ${status}.` });
    }
    if (!TRANSITIONS[from].includes(status)) {
      return res.status(409).json({ message: `Niedozwolona zmiana statusu: ${from} -> ${status}.` });
    }

    // Warunek `AND status = $3` chroni przed wyścigiem dwóch równoległych zmian statusu.
    const result = await db.query(
      'UPDATE tournaments SET status = $1 WHERE id = $2 AND status = $3 RETURNING *',
      [status, id, from]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Status zawodów zmienił się w międzyczasie. Odśwież i spróbuj ponownie.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Błąd aktualizacji statusu');
  }
};
