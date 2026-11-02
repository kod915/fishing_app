const express = require('express');
const router = express.Router();
const catchController = require('../controllers/catchController');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/authMiddleware');

const organizers = [authenticateToken, requireRole('ADMIN', 'JUDGE')];

router.post('/', ...organizers, catchController.addCatch);
router.get('/tournament/:tournamentId', ...organizers, catchController.listByTournament);
router.patch('/:id', ...organizers, catchController.updateCatch);
router.delete('/:id', ...organizers, catchController.deleteCatch);
// ranking publiczny; optionalAuth pozwala organizatorom podejrzeć wersje robocze
router.get('/leaderboard/:tournamentId', optionalAuth, catchController.getLeaderboard);

module.exports = router;
