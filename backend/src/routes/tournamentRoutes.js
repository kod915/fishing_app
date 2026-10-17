const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

router.get('/', tournamentController.getAll);
router.post('/', authenticateToken, requireRole('ADMIN'), tournamentController.create);
router.patch('/:id/status', authenticateToken, requireRole('ADMIN', 'JUDGE'), tournamentController.updateStatus);

module.exports = router;
