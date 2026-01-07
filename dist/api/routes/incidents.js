import { Router } from 'express';
import { getDb, ensureIncidentsTables } from '../lib/db';
const router = Router();
async function isAdmin(userId) {
    if (!userId)
        return false;
    const sql = getDb();
    const result = await sql `SELECT is_admin FROM users WHERE id = ${userId}`;
    return result.length > 0 && result[0].is_admin;
}
function formatIncident(row) {
    return {
        id: String(row.id),
        title: row.title,
        description: row.description,
        status: row.status,
        severity: row.severity,
        affectedServices: row.affected_services || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at,
        updates: row.updates || []
    };
}
// Get active incidents
router.get('/active', async (_req, res) => {
    const sql = getDb();
    await ensureIncidentsTables();
    const result = await sql `
    SELECT i.*, 
      COALESCE(json_agg(
        json_build_object('id', u.id, 'status', u.status, 'message', u.message, 'createdAt', u.created_at)
        ORDER BY u.created_at ASC
      ) FILTER (WHERE u.id IS NOT NULL), '[]') as updates
    FROM incidents i
    LEFT JOIN incident_updates u ON i.id = u.incident_id
    WHERE i.status != 'resolved'
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `;
    return res.json({ success: true, data: result.map(formatIncident) });
});
// Get all incidents
router.get('/', async (req, res) => {
    const sql = getDb();
    await ensureIncidentsTables();
    const limit = parseInt(req.query.limit || '50');
    const result = await sql `
    SELECT i.*, 
      COALESCE(json_agg(
        json_build_object('id', u.id, 'status', u.status, 'message', u.message, 'createdAt', u.created_at)
        ORDER BY u.created_at ASC
      ) FILTER (WHERE u.id IS NOT NULL), '[]') as updates
    FROM incidents i
    LEFT JOIN incident_updates u ON i.id = u.incident_id
    GROUP BY i.id
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;
    return res.json({ success: true, data: result.map(formatIncident) });
});
// Create incident
router.post('/', async (req, res) => {
    const sql = getDb();
    await ensureIncidentsTables();
    const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;
    const { title, description, severity, affectedServices } = req.body;
    if (!await isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    if (!title) {
        return res.status(400).json({ success: false, message: 'Title is required' });
    }
    const result = await sql `
    INSERT INTO incidents (title, description, severity, affected_services) 
    VALUES (${title}, ${description || ''}, ${severity || 'minor'}, ${affectedServices || []}) 
    RETURNING *
  `;
    await sql `
    INSERT INTO incident_updates (incident_id, status, message) 
    VALUES (${result[0].id}, 'investigating', ${'Investigating: ' + title})
  `;
    return res.json({ success: true, data: formatIncident(result[0]) });
});
// Add update to incident
router.post('/update', async (req, res) => {
    const sql = getDb();
    await ensureIncidentsTables();
    const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;
    const { incidentId, status, message } = req.body;
    if (!await isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    if (!incidentId || !status || !message) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    await sql `
    INSERT INTO incident_updates (incident_id, status, message) VALUES (${incidentId}, ${status}, ${message})
  `;
    const resolvedAt = status === 'resolved' ? new Date() : null;
    await sql `
    UPDATE incidents SET status = ${status}, updated_at = NOW(), resolved_at = ${resolvedAt} WHERE id = ${incidentId}
  `;
    return res.json({ success: true, message: 'Update added' });
});
// Update incident
router.put('/:id', async (req, res) => {
    const sql = getDb();
    const id = req.params.id;
    const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;
    const { title, description, severity, affectedServices, status } = req.body;
    if (!await isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const resolvedAt = status === 'resolved' ? new Date() : null;
    await sql `
    UPDATE incidents SET 
      title = CASE WHEN ${title} IS NOT NULL AND ${title} != '' THEN ${title} ELSE title END,
      description = CASE WHEN ${description} IS NOT NULL THEN ${description} ELSE description END,
      severity = CASE WHEN ${severity} IS NOT NULL AND ${severity} != '' THEN ${severity} ELSE severity END,
      affected_services = CASE WHEN ${affectedServices} IS NOT NULL THEN ${affectedServices} ELSE affected_services END,
      status = CASE WHEN ${status} IS NOT NULL AND ${status} != '' THEN ${status} ELSE status END,
      updated_at = NOW(),
      resolved_at = CASE WHEN ${status} = 'resolved' THEN ${resolvedAt} ELSE resolved_at END
    WHERE id = ${id}
  `;
    return res.json({ success: true, message: 'Incident updated' });
});
// Delete incident
router.delete('/:id', async (req, res) => {
    const sql = getDb();
    const id = req.params.id;
    const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;
    if (!await isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    await sql `DELETE FROM incidents WHERE id = ${id}`;
    return res.json({ success: true, message: 'Incident deleted' });
});
export default router;
