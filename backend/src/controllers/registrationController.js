const db = require('../config/db');

exports.registerUser = async (req, res) => {
  const { tournament_id } = req.body;
  const user_id = req.user.id;

  try {
    // Sprawdź ile osób już się zapisało, aby wyznaczyć sektor i stanowisko
    const countRes = await db.query('SELECT COUNT(*)::int as count FROM registrations WHERE tournament_id = $1', [tournament_id]);
    const currentCount = countRes.rows[0].count;

    const sectorLetter = String.fromCharCode(65 + Math.floor(currentCount / 10)); // Sektor A, B, C...
    const sector = `Sektor ${sectorLetter}`;
    const spot_number = (currentCount % 10) + 1;

    const result = await db.query(
      `INSERT INTO registrations (tournament_id, user_id, sector, spot_number)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tournament_id, user_id, sector, spot_number]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Jesteś już zapisany na te zawody.' });
    }
    res.status(500).json({ message: 'Błąd rejestracji na zawody', error: err.message });
  }
};

exports.getByTournament = async (req, res) => {
  const { tournamentId } = req.params;
  try {
    const result = await db.query(
      `SELECT r.*, u.full_name, u.email 
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.tournament_id = $1
       ORDER BY r.sector, r.spot_number`,
      [tournamentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Błąd pobierania rejestracji', error: err.message });
  }
};
