"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// Health check endpoint for auth service
router.get('/check', (_req, res) => {
    return res.json({
        status: 'ok',
        service: 'auth',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
