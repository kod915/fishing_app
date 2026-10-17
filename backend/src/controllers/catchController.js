const db = require('../config/db');

exports.addCatch = async (req, res) => {
  const { tournament_id, user_id, species, weight_grams } = req.body;
  const registered_by = req.user.id;

  try {
    const result = await db.query(
      `INSERT INTO catches (tournament_id, user_id, species, weight_grams, registered_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tournament_id, user_id, species, weight_grams, registered_by]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Błąd dodawania połowu', error: err.message });
  }
};

exports.getLeaderboard = async (req, res) => {
  const { tournamentId } = req.params;
  try {
    const query = `
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
      ORDER BY total_weight DESC, biggest_fish DESC;
    `;
    const result = await db.query(query, [tournamentId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Błąd pobierania wyników', error: err.message });
  }
};
