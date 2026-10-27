const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/authMiddleware');

// optionalAuth: lista jest publiczna, ale zalogowani organizatorzy widzą też wersje robocze
router.get('/', optionalAuth, tournamentController.getAll);
router.post('/', authenticateToken, requireRole('ADMIN'), tournamentController.create);
router.patch('/:id/status', authenticateToken, requireRole('ADMIN', 'JUDGE'), tournamentController.updateStatus);

module.exports = router;
