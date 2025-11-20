const express = require('express');
const router = express.Router();
const { login, setSession, getSession, logout } = require('../controllers/glpiAuthController');

router.post('/login', login);
router.post('/session', setSession);
router.get('/session', getSession);
router.post('/logout', logout);

module.exports = router;
