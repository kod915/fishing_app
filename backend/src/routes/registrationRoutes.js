const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

router.post('/', authenticateToken, registrationController.registerUser);
router.get('/tournament/:tournamentId', authenticateToken, registrationController.getByTournament);
// wypisanie siebie
router.delete('/tournament/:tournamentId', authenticateToken, registrationController.withdraw);
// usunięcie uczestnika przez organizatora
router.delete('/tournament/:tournamentId/users/:userId', authenticateToken, requireRole('ADMIN', 'JUDGE'), registrationController.withdraw);

module.exports = router;
