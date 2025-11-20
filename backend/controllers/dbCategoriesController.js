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

async function getAllCategories(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name FROM glpi_itilcategories ORDER BY name');
    const mapped = rows.map((r) => ({ id: r.id, name: r.name }));
    return res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('dbCategories.getAllCategories error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query categories' });
  }
}

module.exports = { getAllCategories };
