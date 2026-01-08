"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
function formatVersion(v) {
    return {
        id: v.id,
        version: v.version,
        downloadUrl: v.download_url,
        description: v.description || null,
        isActive: v.is_active,
        createdAt: v.created_at
    };
}
// Get all versions
router.get('/', async (_req, res) => {
    const sql = (0, db_1.getDb)();
    await (0, db_1.ensureVersionsTable)();
    const result = await sql `
    SELECT id, version, download_url, description, is_active, created_at
    FROM client_versions
    ORDER BY created_at DESC, id DESC
  `;
    return res.json({ success: true, data: result.map(formatVersion) });
});
// Get latest version
router.get('/latest', async (_req, res) => {
    try {
        const sql = (0, db_1.getDb)();
        await (0, db_1.ensureVersionsTable)();
        const result = await sql `
      SELECT id, version, download_url, description, is_active, created_at
      FROM client_versions
      WHERE is_active = true
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active version found'
            });
        }
        return res.json({
            success: true,
            data: formatVersion(result[0])
        });
    }
    catch (error) {
        console.error('Latest version check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Database error'
        });
    }
});
// Create version
router.post('/', async (req, res) => {
    const sql = (0, db_1.getDb)();
    await (0, db_1.ensureVersionsTable)();
    const { version, downloadUrl, description, isActive } = req.body;
    if (!version || !downloadUrl) {
        return res.status(400).json({ success: false, message: 'version и downloadUrl обязательны' });
    }
    if (isActive) {
        await sql `UPDATE client_versions SET is_active = false WHERE is_active = true`;
    }
    const result = await sql `
    INSERT INTO client_versions (version, download_url, description, is_active)
    VALUES (${String(version).trim()}, ${String(downloadUrl).trim()}, ${description ?? null}, ${Boolean(isActive)})
    RETURNING id, version, download_url, description, is_active, created_at
  `;
    return res.json({ success: true, data: formatVersion(result[0]) });
});
// Update version
router.patch('/:id', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const id = req.params.id;
    const { version, downloadUrl, description, isActive } = req.body;
    if (isActive) {
        await sql `UPDATE client_versions SET is_active = false WHERE is_active = true`;
    }
    const result = await sql `
    UPDATE client_versions SET 
      version = COALESCE(${version ? String(version).trim() : null}, version),
      download_url = COALESCE(${downloadUrl ? String(downloadUrl).trim() : null}, download_url),
      description = COALESCE(${description}, description),
      is_active = COALESCE(${isActive !== undefined ? Boolean(isActive) : null}, is_active)
    WHERE id = ${id}
    RETURNING id, version, download_url, description, is_active, created_at
  `;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Версия не найдена' });
    }
    return res.json({ success: true, data: formatVersion(result[0]) });
});
// Delete version
router.delete('/:id', async (req, res) => {
    const sql = (0, db_1.getDb)();
    const id = req.params.id;
    const result = await sql `DELETE FROM client_versions WHERE id = ${id} RETURNING id`;
    if (result.length === 0) {
        return res.json({ success: false, message: 'Версия не найдена' });
    }
    return res.json({ success: true, message: 'Версия удалена' });
});
exports.default = router;
