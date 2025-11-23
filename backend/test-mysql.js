require('dotenv').config({ path: '/srv/dashboard_tela_cliente/backend/.env' });
const mysql = require('mysql2/promise');
(async () => {
  console.log('env user=', process.env.GLPI_DB_USER);
  console.log('env host=', process.env.GLPI_DB_HOST);
  console.log('env pwd=', process.env.GLPI_DB_PASSWORD ? '***present***' : '***missing***');
  const pool = mysql.createPool({
    host: process.env.GLPI_DB_HOST || '127.0.0.1',
    user: process.env.GLPI_DB_USER || 'root',
    password: process.env.GLPI_DB_PASSWORD || '',
    database: process.env.GLPI_DB_NAME || 'glpi',
    port: process.env.GLPI_DB_PORT ? Number(process.env.GLPI_DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 1,
  });
  try {
    const [rows] = await pool.query("SELECT USER(), CURRENT_USER();");
    console.log('query result:', rows);
  } catch (e) {
    console.error('connection error', e);
  } finally {
    await pool.end();
  }
})();
