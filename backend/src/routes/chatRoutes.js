const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/:tournamentId', authenticateToken, chatController.getHistory);

module.exports = router;