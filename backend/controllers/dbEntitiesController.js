const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.GLPI_DB_HOST || 'localhost',
  user: process.env.GLPI_DB_USER || 'root',
  password: process.env.GLPI_DB_PASSWORD || '',
  database: process.env.GLPI_DB_NAME || 'glpi',
  port: process.env.GLPI_DB_PORT ? Number(process.env.GLPI_DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 5,
});

async function getAllEntities(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name, entities_id, completename FROM glpi_entities ORDER BY name');
    // normalize parent id name to parent_id for frontend
    const mapped = rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.entities_id, completename: r.completename }));
    return res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('dbEntities.getAllEntities error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query entities' });
  }
}

async function getChildren(req, res) {
  const parentId = req.params.parentId;
  if (!parentId) return res.status(400).json({ success: false, message: 'parentId required' });
  try {
    const [rows] = await pool.query('SELECT id, name, entities_id, completename FROM glpi_entities WHERE entities_id = ? ORDER BY name', [parentId]);
    const mapped = rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.entities_id, completename: r.completename }));
    return res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('dbEntities.getChildren error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query entities children' });
  }
}

module.exports = { getAllEntities, getChildren };
