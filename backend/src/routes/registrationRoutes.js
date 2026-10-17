const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/', authenticateToken, registrationController.registerUser);
router.get('/tournament/:tournamentId', authenticateToken, registrationController.getByTournament);

module.exports = router;
