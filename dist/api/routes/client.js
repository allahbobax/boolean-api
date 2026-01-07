import { Router } from 'express';
import { getDb } from '../lib/db';
const router = Router();
// Get active client version
router.get('/version', async (_req, res) => {
    const sql = getDb();
    // Try to get active version first
    let result = await sql `
    SELECT id, version, download_url, description, created_at
    FROM client_versions
    WHERE is_active = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
    // Fallback to latest version
    if (result.length === 0) {
        result = await sql `
      SELECT id, version, download_url, description, created_at
      FROM client_versions
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    }
    if (result.length === 0) {
        return res.json({ success: false, message: 'Версии клиента не найдены' });
    }
    const row = result[0];
    return res.json({
        success: true,
        data: {
            version: row.version,
            downloadUrl: row.download_url,
            changelog: row.description,
            updatedAt: row.created_at ? new Date(row.created_at).toISOString() : null
        }
    });
});
export default router;
