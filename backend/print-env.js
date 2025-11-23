require('dotenv').config({ path: '/srv/dashboard_tela_cliente/backend/.env' });
const p = process.env.GLPI_DB_PASSWORD;
console.log('raw:', p);
console.log('json:', JSON.stringify(p));
console.log('len:', p.length);
for (let i=0;i<p.length;i++) console.log(i, p.charCodeAt(i));
