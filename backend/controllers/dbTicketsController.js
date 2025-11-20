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

// GET /api/db/tickets?limit=50&offset=0&startDate=...&endDate=...&cliente=...&unidade=...
async function getTickets(req, res) {
  try {
    const limitParam = req.query.limit;
    // if client requests limit=0 or limit=all, treat as no LIMIT (return all matching rows)
    const noLimit = limitParam === '0' || String(limitParam).toLowerCase() === 'all';
    const limit = noLimit ? null : Math.min(1000, parseInt(req.query.limit || '100', 10));
    const offset = parseInt(req.query.offset || '0', 10) || 0;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const cliente = req.query.cliente; // entity id (parent)
    const unidade = req.query.unidade; // entity id (child)

    const where = [];
    const params = [];

    if (startDate) {
      where.push('t.date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('t.date <= ?');
      params.push(endDate);
    }
    // If unidade provided, filter by it.
    // Otherwise if cliente provided, filter by it. Optionally include child entities when
    // the client requests `include_children=1` (useful for charts that must show matriz+filiais).
    if (unidade && unidade !== 'all') {
      where.push('t.entities_id = ?');
      params.push(Number(unidade));
    } else if (cliente && cliente !== 'all') {
      const includeChildren = req.query.include_children === '1' || req.query.include_children === 'true' || req.query.include_children === 'yes';
      if (includeChildren) {
        // include tickets that belong to the parent OR to any child entity whose parent is the cliente
        // Use the already-joined `parent` alias (parent.id = e.entities_id) to avoid column resolution issues
        where.push('(t.entities_id = ? OR parent.id = ?)');
        params.push(Number(cliente));
        params.push(Number(cliente));
      } else {
        where.push('t.entities_id = ?');
        params.push(Number(cliente));
      }
    }

    // excluded requerentes (user ids) provided as comma-separated list
    let excludeRequerentes = [];
    if (req.query.exclude_requerentes) {
      excludeRequerentes = String(req.query.exclude_requerentes).split(',').map((s) => Number(s)).filter(Boolean);
      if (excludeRequerentes.length) {
        const ph = excludeRequerentes.map(() => '?').join(',');
        where.push(`NOT EXISTS (SELECT 1 FROM glpi_tickets_users tu_ex WHERE tu_ex.tickets_id = t.id AND tu_ex.users_id IN (${ph}))`);
        params.push(...excludeRequerentes);
      }

      // add technician filtering to TMA summary
      if (req.query.tecnico && String(req.query.tecnico) !== 'all') {
        const techs = String(req.query.tecnico).split(',').map((s) => Number(s)).filter(Boolean);
        if (techs.length) {
          const ph = techs.map(() => '?').join(',');
          where.push(`EXISTS (SELECT 1 FROM glpi_tickets_users tu_tech WHERE tu_tech.tickets_id = t.id AND tu_tech.users_id IN (${ph}) AND tu_tech.type = 2)`);
          params.push(...techs);
        }
      }
      // filter by assigned technician(s) for NPS/TMA and tickets
      // (handled below in summaries as well)
    }

    // filter by assigned technician(s) (tecnico) provided as comma-separated list of user ids
    if (req.query.tecnico && String(req.query.tecnico) !== 'all') {
      const techs = String(req.query.tecnico).split(',').map((s) => Number(s)).filter(Boolean);
      if (techs.length) {
        const ph = techs.map(() => '?').join(',');
        where.push(`EXISTS (SELECT 1 FROM glpi_tickets_users tu_tech WHERE tu_tech.tickets_id = t.id AND tu_tech.users_id IN (${ph}) AND tu_tech.type = 2)`);
        params.push(...techs);
      }
    }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    // main select with entity name, parent name, category name and requester (requerente)
    const sql = `
      SELECT t.id, t.name AS title, t.date, t.status, t.entities_id, t.itilcategories_id,
             e.name AS unidade_name, parent.name AS parent_name,
             COALESCE(NULLIF(cat.name, ''), '(sem categoria)') AS categoria_name,
             ts.satisfaction AS satisfaction,
             t.takeintoaccountdate AS takeintoaccountdate,
             t.solvedate AS solvedate,
             t.closedate AS closedate,
             TIMESTAMPDIFF(MINUTE, COALESCE(t.takeintoaccountdate, t.date), COALESCE(t.solvedate, t.closedate)) AS tempo_solucao_min,
             TIMESTAMPDIFF(MINUTE, t.date, t.takeintoaccountdate) AS tme_min,
             (
               SELECT TRIM(COALESCE(NULLIF(COALESCE(u.realname, ''), ''), COALESCE(u.name, '')))
               FROM glpi_tickets_users tu
               JOIN glpi_users u ON u.id = tu.users_id
               WHERE tu.tickets_id = t.id
               ORDER BY (tu.type = 1) DESC, (tu.type = 2) DESC
               LIMIT 1
             ) AS requerente_name,
             (
               SELECT tu.users_id
               FROM glpi_tickets_users tu
               WHERE tu.tickets_id = t.id
               ORDER BY (tu.type = 1) DESC, (tu.type = 2) DESC
               LIMIT 1
             ) AS requerente_id
                   ,(
                     SELECT TRIM(COALESCE(NULLIF(COALESCE(u2.realname, ''), ''), COALESCE(u2.name, '')))
                     FROM glpi_tickets_users tu2
                     JOIN glpi_users u2 ON u2.id = tu2.users_id
                     WHERE tu2.tickets_id = t.id AND tu2.type = 2
                     ORDER BY tu2.users_id LIMIT 1
                   ) AS tecnico_name,
                   (
                     SELECT tu2.users_id
                     FROM glpi_tickets_users tu2
                     WHERE tu2.tickets_id = t.id AND tu2.type = 2
                     ORDER BY tu2.users_id LIMIT 1
                   ) AS tecnico_id
      FROM glpi_tickets t
      LEFT JOIN glpi_entities e ON e.id = t.entities_id
      LEFT JOIN glpi_entities parent ON parent.id = e.entities_id
      LEFT JOIN glpi_itilcategories cat ON cat.id = t.itilcategories_id
      LEFT JOIN glpi_ticketsatisfactions ts ON ts.tickets_id = t.id
      ${whereSql}
      ORDER BY t.date DESC
      ${noLimit ? '' : 'LIMIT ? OFFSET ?'}
    `;

    const dataParams = noLimit ? params : params.concat([limit, offset]);
    const [rows] = await pool.query(sql, dataParams);

    // count total for the same filters (include same joins so WHERE can reference joined aliases)
    const countSql = `
      SELECT COUNT(*) as cnt
      FROM glpi_tickets t
      LEFT JOIN glpi_entities e ON e.id = t.entities_id
      LEFT JOIN glpi_entities parent ON parent.id = e.entities_id
      ${whereSql}
    `;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows && countRows[0] ? Number(countRows[0].cnt) : 0;

    const mapped = rows.map((r) => ({
      id: r.id,
      titulo: r.title,
      date: r.date,
      dataRegistro: r.date,
      status: r.status,
      unidadeId: r.entities_id,
      unidade_name: r.unidade_name || null,
    // prefer the actual unit name (unidade_name) so table shows the entity the ticket belongs to,
    // falling back to parent_name only when unidade_name is not available
    cliente: r.unidade_name || r.parent_name || null,
    requerente: r.requerente_name || null,
    requerente_id: (r.requerente_id !== null && r.requerente_id !== undefined) ? Number(r.requerente_id) : null,
    tecnico: r.tecnico_name || null,
    tecnico_id: (r.tecnico_id !== null && r.tecnico_id !== undefined) ? Number(r.tecnico_id) : null,
      notaNps: typeof r.satisfaction === 'number' ? r.satisfaction : (r.satisfaction ? Number(r.satisfaction) : null),
      categoria: r.categoria_name,
      categoria_id: r.itilcategories_id
      ,tempoSolucaoMin: (r.tempo_solucao_min !== null && r.tempo_solucao_min !== undefined) ? Number(r.tempo_solucao_min) : null
      ,tmeMin: (r.tme_min !== null && r.tme_min !== undefined) ? Number(r.tme_min) : null
      ,takeintoaccountdate: r.takeintoaccountdate ? r.takeintoaccountdate : null
      ,solvedate: r.solvedate ? r.solvedate : null
      ,closedate: r.closedate ? r.closedate : null
    }));

    return res.json({ success: true, total, data: mapped });
  } catch (err) {
    console.error('dbTickets.getTickets error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query tickets' });
  }
}

module.exports = { getTickets };

// GET /api/db/tickets/nps -> aggregated NPS summary for the same filters used by getTickets
async function getNpsSummary(req, res) {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const cliente = req.query.cliente;
    const unidade = req.query.unidade;

    const where = [];
    const params = [];
    if (startDate) {
      where.push('t.date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('t.date <= ?');
      params.push(endDate);
    }
    if (unidade && unidade !== 'all') {
      where.push('t.entities_id = ?');
      params.push(Number(unidade));
    } else if (cliente && cliente !== 'all') {
      const includeChildren = req.query.include_children === '1' || req.query.include_children === 'true' || req.query.include_children === 'yes';
      if (includeChildren) {
        where.push('(t.entities_id = ? OR parent.id = ?)');
        params.push(Number(cliente));
        params.push(Number(cliente));
      } else {
        where.push('t.entities_id = ?');
        params.push(Number(cliente));
      }
    }
    // excluded requerentes (user ids) provided as comma-separated list
    let excludeRequerentes = [];
    if (req.query.exclude_requerentes) {
      excludeRequerentes = String(req.query.exclude_requerentes).split(',').map((s) => Number(s)).filter(Boolean);
      if (excludeRequerentes.length) {
        const ph = excludeRequerentes.map(() => '?').join(',');
        where.push(`NOT EXISTS (SELECT 1 FROM glpi_tickets_users tu_ex WHERE tu_ex.tickets_id = t.id AND tu_ex.users_id IN (${ph}))`);
        params.push(...excludeRequerentes);
      }

      // add technician filter for NPS summary
      if (req.query.tecnico && String(req.query.tecnico) !== 'all') {
        const techs = String(req.query.tecnico).split(',').map((s) => Number(s)).filter(Boolean);
        if (techs.length) {
          const ph = techs.map(() => '?').join(',');
          where.push(`EXISTS (SELECT 1 FROM glpi_tickets_users tu_tech WHERE tu_tech.tickets_id = t.id AND tu_tech.users_id IN (${ph}) AND tu_tech.type = 2)`);
          params.push(...techs);
        }
      }
    }

    // filter by assigned technician(s) (tecnico) provided as comma-separated list of user ids
    if (req.query.tecnico && String(req.query.tecnico) !== 'all') {
      const techs = String(req.query.tecnico).split(',').map((s) => Number(s)).filter(Boolean);
      if (techs.length) {
        const ph = techs.map(() => '?').join(',');
        where.push(`EXISTS (SELECT 1 FROM glpi_tickets_users tu_tech WHERE tu_tech.tickets_id = t.id AND tu_tech.users_id IN (${ph}) AND tu_tech.type = 2)`);
        params.push(...techs);
      }
    }

    // require satisfaction to be present
    where.push("ts.satisfaction IS NOT NULL AND TRIM(ts.satisfaction) <> ''");

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    const sql = `
      SELECT
        COUNT(DISTINCT ts.tickets_id) AS total_responses,
        SUM(CASE WHEN CAST(ts.satisfaction AS SIGNED) >= 5 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN CAST(ts.satisfaction AS SIGNED) = 4 THEN 1 ELSE 0 END) AS neutros,
        SUM(CASE WHEN CAST(ts.satisfaction AS SIGNED) BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS detratores
      FROM glpi_tickets t
      LEFT JOIN glpi_entities e ON e.id = t.entities_id
      LEFT JOIN glpi_entities parent ON parent.id = e.entities_id
      LEFT JOIN glpi_ticketsatisfactions ts ON ts.tickets_id = t.id
      ${whereSql}
    `;

    const [rows] = await pool.query(sql, params);
    const out = rows && rows[0] ? rows[0] : { total_responses: 0, promotores: 0, neutros: 0, detratores: 0 };
    // compute NPS value
    const total = Number(out.total_responses) || 0;
    const prom = Number(out.promotores) || 0;
    const det = Number(out.detratores) || 0;
    const nps = total === 0 ? 0 : Math.round(((prom / total) - (det / total)) * 100);

    return res.json({ success: true, data: { total_responses: total, promotores: prom, neutros: Number(out.neutros) || 0, detratores: det, nps } });
  } catch (err) {
    console.error('dbTickets.getNpsSummary error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to compute nps summary' });
  }
}

module.exports = { getTickets, getNpsSummary };

// GET /api/db/tickets/tma -> aggregated TMA (avg time to resolution in minutes) for the same filters
async function getTmaSummary(req, res) {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const cliente = req.query.cliente;
    const unidade = req.query.unidade;

    const where = [];
    const params = [];
    if (startDate) {
      where.push('t.date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('t.date <= ?');
      params.push(endDate);
    }
    if (unidade && unidade !== 'all') {
      where.push('t.entities_id = ?');
      params.push(Number(unidade));
    } else if (cliente && cliente !== 'all') {
      const includeChildren = req.query.include_children === '1' || req.query.include_children === 'true' || req.query.include_children === 'yes';
      if (includeChildren) {
        where.push('(t.entities_id = ? OR parent.id = ?)');
        params.push(Number(cliente));
        params.push(Number(cliente));
      } else {
        where.push('t.entities_id = ?');
        params.push(Number(cliente));
      }
    }

    // excluded requerentes (user ids) provided as comma-separated list
    let excludeRequerentes = [];
    if (req.query.exclude_requerentes) {
      excludeRequerentes = String(req.query.exclude_requerentes).split(',').map((s) => Number(s)).filter(Boolean);
      if (excludeRequerentes.length) {
        const ph = excludeRequerentes.map(() => '?').join(',');
        where.push(`NOT EXISTS (SELECT 1 FROM glpi_tickets_users tu_ex WHERE tu_ex.tickets_id = t.id AND tu_ex.users_id IN (${ph}))`);
        params.push(...excludeRequerentes);
      }
    }

    // filter by assigned technician(s) (tecnico) provided as comma-separated list of user ids
    if (req.query.tecnico && String(req.query.tecnico) !== 'all') {
      const techs = String(req.query.tecnico).split(',').map((s) => Number(s)).filter(Boolean);
      if (techs.length) {
        const ph = techs.map(() => '?').join(',');
        where.push(`EXISTS (SELECT 1 FROM glpi_tickets_users tu_tech WHERE tu_tech.tickets_id = t.id AND tu_tech.users_id IN (${ph}) AND tu_tech.type = 2)`);
        params.push(...techs);
      }
    }

    // only tickets that have a solved/close timestamp
    where.push('COALESCE(t.solvedate, t.closedate) IS NOT NULL');

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    const sql = `
      SELECT
        COUNT(*) AS solved_count,
        AVG(TIMESTAMPDIFF(MINUTE, COALESCE(t.takeintoaccountdate, t.date), COALESCE(t.solvedate, t.closedate))) AS avg_tma_minutes
      FROM glpi_tickets t
      LEFT JOIN glpi_entities e ON e.id = t.entities_id
      LEFT JOIN glpi_entities parent ON parent.id = e.entities_id
      ${whereSql}
    `;

    const [rows] = await pool.query(sql, params);
    const out = rows && rows[0] ? rows[0] : { solved_count: 0, avg_tma_minutes: null };
    return res.json({ success: true, data: { solved_count: Number(out.solved_count) || 0, avg_tma_minutes: out.avg_tma_minutes !== null ? Number(parseFloat(out.avg_tma_minutes).toFixed(1)) : null } });
  } catch (err) {
    console.error('dbTickets.getTmaSummary error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to compute tma summary' });
  }
}

module.exports = { getTickets, getNpsSummary, getTmaSummary };

// GET /api/db/technicians -> list distinct technicians (users linked to tickets with type=2)
async function getTechnicians(req, res) {
  try {
    const sql = `
      SELECT DISTINCT u.id AS id,
        TRIM(CONCAT_WS(' ', NULLIF(u.firstname, ''), NULLIF(u.realname, ''))) AS display_name,
        TRIM(u.name) AS login
      FROM glpi_tickets_users tu
      JOIN glpi_users u ON u.id = tu.users_id
      WHERE tu.type = 2
      ORDER BY display_name
    `;
    const [rows] = await pool.query(sql);
    const mapped = rows.map((r) => ({ id: r.id, display_name: r.display_name || r.login || String(r.id), login: r.login }));
    return res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('dbTickets.getTechnicians error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query technicians' });
  }
}

// include in exports
module.exports.getTechnicians = getTechnicians;
