import { Router, Request, Response } from 'express';
import type { Incident } from '../types';
import { getDb, ensureIncidentsTables } from '../lib/db';

const router = Router();

async function isAdmin(userId: number | null): Promise<boolean> {
  if (!userId) return false;
  const sql = getDb();
  const result = await sql`SELECT is_admin FROM users WHERE id = ${userId}`;
  return result.length > 0 && result[0].is_admin;
}

function formatIncident(row: Record<string, unknown>): Incident {
  return {
    id: String(row.id),
    title: row.title as string,
    description: row.description as string,
    status: row.status as string,
    severity: row.severity as string,
    affectedServices: (row.affected_services as string[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    resolvedAt: row.resolved_at as string | null,
    updates: (row.updates as Incident['updates']) || []
  };
}

// Get active incidents
router.get('/active', async (_req: Request, res: Response) => {
  const sql = getDb();
  await ensureIncidentsTables();

  const result = await sql`
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
router.get('/', async (req: Request, res: Response) => {
  const sql = getDb();
  await ensureIncidentsTables();

  const limit = parseInt(req.query.limit as string || '50');

  const result = await sql`
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


// Валидация входных данных
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 2000;
const VALID_SEVERITIES = ['minor', 'major', 'critical'];
const VALID_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];

function validateIncidentInput(data: { title?: string; description?: string; severity?: string; status?: string; message?: string }): { valid: boolean; error?: string } {
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.length > MAX_TITLE_LENGTH) {
      return { valid: false, error: `Title must be a string with max ${MAX_TITLE_LENGTH} characters` };
    }
  }
  if (data.description !== undefined) {
    if (typeof data.description !== 'string' || data.description.length > MAX_DESCRIPTION_LENGTH) {
      return { valid: false, error: `Description must be a string with max ${MAX_DESCRIPTION_LENGTH} characters` };
    }
  }
  if (data.message !== undefined) {
    if (typeof data.message !== 'string' || data.message.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message must be a string with max ${MAX_MESSAGE_LENGTH} characters` };
    }
  }
  if (data.severity !== undefined && !VALID_SEVERITIES.includes(data.severity)) {
    return { valid: false, error: `Severity must be one of: ${VALID_SEVERITIES.join(', ')}` };
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    return { valid: false, error: `Status must be one of: ${VALID_STATUSES.join(', ')}` };
  }
  return { valid: true };
}

// Create incident
router.post('/', async (req: Request, res: Response) => {
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

  // БЕЗОПАСНОСТЬ: Валидация длины входных данных
  const validation = validateIncidentInput({ title, description, severity });
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  const result = await sql`
    INSERT INTO incidents (title, description, severity, affected_services) 
    VALUES (${title}, ${description || ''}, ${severity || 'minor'}, ${affectedServices || []}) 
    RETURNING *
  `;

  await sql`
    INSERT INTO incident_updates (incident_id, status, message) 
    VALUES (${result[0].id}, 'investigating', ${'Investigating: ' + title})
  `;

  return res.json({ success: true, data: formatIncident(result[0]) });
});

// Add update to incident
router.post('/update', async (req: Request, res: Response) => {
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

  // БЕЗОПАСНОСТЬ: Валидация входных данных
  const validation = validateIncidentInput({ status, message });
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  await sql`
    INSERT INTO incident_updates (incident_id, status, message) VALUES (${incidentId}, ${status}, ${message})
  `;

  const resolvedAt = status === 'resolved' ? new Date() : null;

  await sql`
    UPDATE incidents SET status = ${status}, updated_at = NOW(), resolved_at = ${resolvedAt} WHERE id = ${incidentId}
  `;

  return res.json({ success: true, message: 'Update added' });
});

// Update incident
router.put('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;
  const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;
  const { title, description, severity, affectedServices, status } = req.body;

  if (!await isAdmin(userId)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  // БЕЗОПАСНОСТЬ: Валидация входных данных
  const validation = validateIncidentInput({ title, description, severity, status });
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  const resolvedAt = status === 'resolved' ? new Date() : null;

  await sql`
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
router.delete('/:id', async (req: Request, res: Response) => {
  const sql = getDb();
  const id = req.params.id;
  const userId = req.query.userId ? Number(req.query.userId) : req.body?.userId;

  if (!await isAdmin(userId)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  await sql`DELETE FROM incidents WHERE id = ${id}`;
  return res.json({ success: true, message: 'Incident deleted' });
});

export default router;