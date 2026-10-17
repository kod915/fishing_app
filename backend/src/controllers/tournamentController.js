const db = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, COUNT(r.id)::int AS registered_count
      FROM tournaments t
      LEFT JOIN registrations r ON t.id = r.tournament_id
      GROUP BY t.id
      ORDER BY t.event_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Błąd pobierania zawodów', error: err.message });
  }
};

exports.create = async (req, res) => {
  const { name, location, event_date, max_participants } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO tournaments (name, location, event_date, max_participants, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, location, event_date, max_participants || 30, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Błąd tworzenia zawodów', error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      `UPDATE tournaments SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Błąd aktualizacji statusu', error: err.message });
  }
};
