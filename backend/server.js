require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const glpiAuthRoutes = require('./routes/glpiAuthRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
app.use(session({
  name: 'ptc.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Mount GLPI auth routes
app.use('/api/glpi', glpiAuthRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Backend minimal para GLPI auth (session_token)', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`Backend GLPI rodando na porta ${PORT}`);
});
