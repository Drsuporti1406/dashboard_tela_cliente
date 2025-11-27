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

// GET /api/db/my-entities?email=user@example.com - returns entities based on GLPI session or user email
async function getMyEntities(req, res) {
  try {
    // PRIORITY 1: Try to use GLPI API session token (from helpcentral_front or direct login)
    const { getMyEntities: fetchMyEntities } = require('../services/glpiClient');
    const sess = req.session && req.session.glpi;
    const token = sess && sess.session_token;
    
    if (token) {
      try {
        const glpiEntities = await fetchMyEntities(token);
        const entityIds = glpiEntities.map(e => e.id);

        if (entityIds.length > 0) {
          const placeholders = entityIds.map(() => '?').join(',');
          const [rows] = await pool.query(
            `SELECT id, name, entities_id, completename FROM glpi_entities WHERE id IN (${placeholders}) ORDER BY name`,
            entityIds
          );
          const mapped = rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.entities_id, completename: r.completename }));
          return res.json({ success: true, data: mapped, source: 'glpi_api_token' });
        }
      } catch (apiErr) {
        console.warn('Failed to fetch entities via GLPI API, trying email fallback:', apiErr.message);
        // Continue to email-based lookup
      }
    }
    
    // PRIORITY 2: Fallback to email-based lookup (when no valid session token)
    const userEmail = req.query.email || (req.session && req.session.userEmail);
    
    if (!userEmail) {
      return res.status(401).json({ success: false, message: 'Not authenticated - no session token or email provided', requireLogin: true });
    }

    // NEW: Fetch entities based on user email from database
    // 1. Find user by email in glpi_users
    const [users] = await pool.query(
      'SELECT id FROM glpi_users WHERE LOWER(TRIM(emails_id)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [userEmail, userEmail.split('@')[0]] // try email or username part before @
    );

    if (!users || users.length === 0) {
      console.warn(`User not found in GLPI for email: ${userEmail}`);
      return res.json({ success: true, data: [], message: 'User not found in GLPI' });
    }

    const userId = users[0].id;

    // 2. Get user's profile and entities from glpi_profiles_users
    const [profiles] = await pool.query(
      `SELECT DISTINCT entities_id, is_recursive FROM glpi_profiles_users WHERE users_id = ?`,
      [userId]
    );

    if (!profiles || profiles.length === 0) {
      console.warn(`No profiles found for user ${userId}`);
      return res.json({ success: true, data: [], message: 'No profiles found for user' });
    }

    // 3. Build entity list (including recursive children)
    const entityIds = new Set();
    
    for (const profile of profiles) {
      entityIds.add(profile.entities_id);
      
      // If recursive, get all child entities
      if (profile.is_recursive === 1) {
        const [children] = await pool.query(
          `WITH RECURSIVE entity_tree AS (
            SELECT id, entities_id FROM glpi_entities WHERE entities_id = ?
            UNION ALL
            SELECT e.id, e.entities_id FROM glpi_entities e
            INNER JOIN entity_tree et ON e.entities_id = et.id
          )
          SELECT id FROM entity_tree`,
          [profile.entities_id]
        );
        children.forEach(c => entityIds.add(c.id));
      }
    }

    const entityIdArray = Array.from(entityIds);
    
    if (entityIdArray.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 4. Fetch entity details
    const placeholders = entityIdArray.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, name, entities_id, completename FROM glpi_entities WHERE id IN (${placeholders}) ORDER BY name`,
      entityIdArray
    );
    
    const mapped = rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.entities_id, completename: r.completename }));
    return res.json({ success: true, data: mapped, userEmail, userId });
    
  } catch (err) {
    console.error('dbEntities.getMyEntities error', err);
    // Check if error is 401 from GLPI API (invalid/expired token)
    if (err.message && err.message.includes('401')) {
      return res.status(401).json({ success: false, message: 'Session expired or invalid', requireLogin: true });
    }
    return res.status(500).json({ success: false, message: err.message || 'failed to query user entities' });
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

// exports will be defined at the end of the file

async function getComputersByEntity(req, res) {
  const entityId = req.params.id;
  if (!entityId) return res.status(400).json({ success: false, message: 'entity id required' });
  try {
    const [rows] = await pool.query(
      `SELECT
         c.id, c.entities_id, c.name, c.serial, c.users_id, c.locations_id, c.computermodels_id, c.manufacturers_id,
         c.date_creation, c.last_boot, c.last_inventory_update, c.comment,
       GROUP_CONCAT(DISTINCT sl.id SEPARATOR ',') AS license_ids,
       GROUP_CONCAT(DISTINCT sl.states_id SEPARATOR ',') AS license_states,
       -- states aggregated only for licenses whose type parent is 4 (Microsoft 365 categories)
       GROUP_CONCAT(DISTINCT CASE WHEN COALESCE(pst.id, 0) = 4 THEN sl.states_id END SEPARATOR ',') AS license_states_parent4,
         GROUP_CONCAT(DISTINCT s.name SEPARATOR '|') AS licensed_software,
         -- aggregate type info as parentId|typeId|typeName entries separated by '||'
         GROUP_CONCAT(DISTINCT CONCAT(COALESCE(pst.id, 0),'|',st.id,'|',REPLACE(st.name, '|', ' ')) SEPARATOR '||') AS license_type_info
       FROM glpi_computers c
       LEFT JOIN glpi_items_softwarelicenses isl ON isl.items_id = c.id AND isl.itemtype = 'Computer'
       LEFT JOIN glpi_softwarelicenses sl ON sl.id = isl.softwarelicenses_id
       LEFT JOIN glpi_softwares s ON s.id = sl.softwares_id
       LEFT JOIN glpi_softwarelicensetypes st ON st.id = sl.softwarelicensetypes_id
       LEFT JOIN glpi_softwarelicensetypes pst ON pst.id = st.softwarelicensetypes_id
       WHERE c.entities_id = ? AND c.is_deleted = 0
       GROUP BY c.id
       ORDER BY c.name
       LIMIT 2000`,
      [entityId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('dbEntities.getComputersByEntity error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to query computers' });
  }
}

// export functions
module.exports = { getAllEntities, getMyEntities, getChildren, getComputersByEntity, getComputersCount, searchComputersByName };

async function searchComputersByName(req, res) {
  const name = (req.query.name || '').trim();
  // debug: log incoming search requests
  try { console.debug('DBG_SEARCH_QUERY', name); } catch (e) {}
  if (!name) return res.status(400).json({ success: false, message: 'name query required' });
  try {
    const q = `%${name}%`;
    const [rows] = await pool.query(
      `SELECT
         c.id, c.entities_id, c.name, c.serial, c.users_id, c.locations_id, c.computermodels_id, c.manufacturers_id,
         c.date_creation, c.last_boot, c.last_inventory_update, c.comment,
         GROUP_CONCAT(DISTINCT sl.id SEPARATOR ',') AS license_ids,
         GROUP_CONCAT(DISTINCT sl.states_id SEPARATOR ',') AS license_states,
         GROUP_CONCAT(DISTINCT CASE WHEN COALESCE(pst.id, 0) = 4 THEN sl.states_id END SEPARATOR ',') AS license_states_parent4,
         GROUP_CONCAT(DISTINCT s.name SEPARATOR '|') AS licensed_software,
         GROUP_CONCAT(DISTINCT CONCAT(COALESCE(pst.id, 0),'|',st.id,'|',REPLACE(st.name, '|', ' ')) SEPARATOR '||') AS license_type_info
       FROM glpi_computers c
       LEFT JOIN glpi_items_softwarelicenses isl ON isl.items_id = c.id AND isl.itemtype = 'Computer'
       LEFT JOIN glpi_softwarelicenses sl ON sl.id = isl.softwarelicenses_id
       LEFT JOIN glpi_softwares s ON s.id = sl.softwares_id
       LEFT JOIN glpi_softwarelicensetypes st ON st.id = sl.softwarelicensetypes_id
       LEFT JOIN glpi_softwarelicensetypes pst ON pst.id = st.softwarelicensetypes_id
       WHERE (c.name LIKE ? OR c.serial LIKE ?)
       AND c.is_deleted = 0
       GROUP BY c.id
       ORDER BY c.name
       LIMIT 500`,
      [q, q]
    );
    try { console.debug('DBG_SEARCH_RESULT_COUNT', name, Array.isArray(rows) ? rows.length : 0); } catch (e) {}
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('dbEntities.searchComputersByName error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to search computers' });
  }
}

async function getComputersCount(req, res) {
  try {
    const entityId = req.query.entityId;
    if (entityId && Number(entityId) > 0) {
      const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM glpi_computers WHERE entities_id = ? AND is_deleted = 0', [Number(entityId)]);
      const cnt = rows && rows[0] && rows[0].cnt ? Number(rows[0].cnt) : 0;
      return res.json({ success: true, count: cnt });
    }
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM glpi_computers WHERE is_deleted = 0');
    const cnt = rows && rows[0] && rows[0].cnt ? Number(rows[0].cnt) : 0;
    return res.json({ success: true, count: cnt });
  } catch (err) {
    console.error('dbEntities.getComputersCount error', err);
    return res.status(500).json({ success: false, message: err.message || 'failed to count computers' });
  }
}
