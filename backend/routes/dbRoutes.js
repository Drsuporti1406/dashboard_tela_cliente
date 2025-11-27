const express = require('express');
const router = express.Router();
const { getAllEntities, getMyEntities, getChildren } = require('../controllers/dbEntitiesController');
const { getTickets, getNpsSummary, getTmaSummary, getTechnicians } = require('../controllers/dbTicketsController');
const { getAllCategories } = require('../controllers/dbCategoriesController');

// GET /api/db/entities -> all entities
router.get('/entities', getAllEntities);

// GET /api/db/my-entities -> entities the logged user has access to
router.get('/my-entities', getMyEntities);

// GET /api/db/entities/children/:parentId -> children of given parent
router.get('/entities/children/:parentId', getChildren);

// GET /api/db/entities/:id/computers -> computers for given entity
router.get('/entities/:id/computers', require('../controllers/dbEntitiesController').getComputersByEntity);

// GET /api/db/computers/count -> total computers (optional ?entityId=)
router.get('/computers/count', require('../controllers/dbEntitiesController').getComputersCount);

// GET /api/db/computers/search?name= -> search computers by name or serial
router.get('/computers/search', require('../controllers/dbEntitiesController').searchComputersByName);

// GET /api/db/tickets -> list tickets (supports query filters)
router.get('/tickets', getTickets);

// GET /api/db/tickets/details?id=123 -> ticket details + followups (best-effort)
router.get('/tickets/details', require('../controllers/dbTicketsController').getTicketDetails);

// GET /api/db/tickets/nps -> aggregated NPS summary for current filters
router.get('/tickets/nps', getNpsSummary);

// GET /api/db/tickets/tma -> aggregated TMA summary for current filters
router.get('/tickets/tma', getTmaSummary);

// GET /api/db/categories -> list categories
router.get('/categories', getAllCategories);

// GET /api/db/technicians -> list technicians (assigned users)
router.get('/technicians', getTechnicians);

// lightweight client logs endpoint (fire-and-forget)
const fs = require('fs');
const path = require('path');

router.post('/client-logs', (req, res) => {
  try {
    // ensure logs directory exists
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const outFile = path.join(logsDir, 'client.log');
    const entry = { received: new Date().toISOString(), body: req.body };
    const line = JSON.stringify(entry) + '\n';
    // append asynchronously (fire-and-forget)
    fs.appendFile(outFile, line, (err) => {
      if (err) console.error('Failed to write client log', err);
    });
    // also print a short summary to console for realtime diagnosis
    try {
      const summary = Array.isArray(req.body.logs) ? `${req.body.logs.length} logs` : '';
      console.log('[client-log]', req.body.source || '', summary);
    } catch (e) {}
  } catch (e) {
    console.error('client-log endpoint error', e);
  }
  return res.json({ success: true });
});

// DEBUG: list tables matching 'ticket' (temporary helper)
router.get('/debug/tables', async (req, res) => {
  try {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
      host: process.env.GLPI_DB_HOST || 'localhost',
      user: process.env.GLPI_DB_USER || 'root',
      password: process.env.GLPI_DB_PASSWORD || '',
      database: process.env.GLPI_DB_NAME || 'glpi',
      port: process.env.GLPI_DB_PORT ? Number(process.env.GLPI_DB_PORT) : 3306,
      waitForConnections: false,
      connectionLimit: 1,
    });
    const [rows] = await pool.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%ticket%'", [process.env.GLPI_DB_NAME || 'glpi']);
    await pool.end();
    return res.json({ success: true, data: rows.map(r => r.TABLE_NAME) });
  } catch (err) {
    console.error('debug/tables error', err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  }
});

// DEBUG: show distinct types in glpi_tickets_users with counts and sample entries
router.get('/debug/ticket-user-types', async (req, res) => {
  try {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
      host: process.env.GLPI_DB_HOST || 'localhost',
      user: process.env.GLPI_DB_USER || 'root',
      password: process.env.GLPI_DB_PASSWORD || '',
      database: process.env.GLPI_DB_NAME || 'glpi',
      port: process.env.GLPI_DB_PORT ? Number(process.env.GLPI_DB_PORT) : 3306,
      waitForConnections: false,
      connectionLimit: 1,
    });
    const [rows] = await pool.query("SELECT type, COUNT(*) AS cnt FROM glpi_tickets_users GROUP BY type ORDER BY cnt DESC");
    // fetch a small sample for each type
    const samples = {};
    for (const r of rows) {
      const [s] = await pool.query('SELECT tickets_id, users_id FROM glpi_tickets_users WHERE type = ? LIMIT 5', [r.type]);
      samples[r.type] = s;
    }
    await pool.end();
    return res.json({ success: true, types: rows, samples });
  } catch (err) {
    console.error('debug/ticket-user-types error', err);
    return res.status(500).json({ success: false, message: String(err.message || err) });
  }
});

module.exports = router;
