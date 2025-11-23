const mysql = require('mysql2/promise');
(async () => {
  const cfg = {
    host: '127.0.0.1',
    user: 'glpirelatorio',
    password: "dr5up0rt1!@#$%",
    database: 'glpi',
    port: 3306,
  };
  console.log('Attempting TCP connection with hardcoded password');
  try {
    const conn = await mysql.createConnection(cfg);
    const [rows] = await conn.query('SELECT USER(), CURRENT_USER();');
    console.log('TCP success:', rows);
    await conn.end();
  } catch (e) {
    console.error('TCP error', e.code, e.sqlState, e.sqlMessage);
  }
})();
