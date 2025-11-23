require('dotenv').config({ path: '/srv/dashboard_tela_cliente/backend/.env' });
const mysql = require('mysql2/promise');
(async () => {
  const cfg = {
    host: process.env.GLPI_DB_HOST || '127.0.0.1',
    user: process.env.GLPI_DB_USER || 'root',
    password: process.env.GLPI_DB_PASSWORD || '',
    database: process.env.GLPI_DB_NAME || 'glpi',
    port: process.env.GLPI_DB_PORT ? Number(process.env.GLPI_DB_PORT) : 3306,
  };
  console.log('Trying TCP connect with config:', {host: cfg.host, user: cfg.user, port: cfg.port});
  try {
    const conn = await mysql.createConnection(cfg);
    const [rows] = await conn.query('SELECT USER(), CURRENT_USER();');
    console.log('TCP success:', rows);
    await conn.end();
  } catch (e) {
    console.error('TCP error', e.code, e.sqlState, e.sqlMessage);
  }

  console.log('Trying socket connect');
  try {
    const sockCfg = Object.assign({}, cfg, { socketPath: '/var/run/mysqld/mysqld.sock', host: undefined, port: undefined });
    const conn2 = await mysql.createConnection(sockCfg);
    const [rows2] = await conn2.query('SELECT USER(), CURRENT_USER();');
    console.log('SOCKET success:', rows2);
    await conn2.end();
  } catch (e) {
    console.error('SOCKET error', e.code, e.sqlState, e.sqlMessage);
  }
})();
