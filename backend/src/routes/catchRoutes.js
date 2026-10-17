const express = require('express');
const router = express.Router();
const catchController = require('../controllers/catchController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

router.post('/', authenticateToken, requireRole('ADMIN', 'JUDGE'), catchController.addCatch);
router.get('/leaderboard/:tournamentId', catchController.getLeaderboard);

module.exports = router;
