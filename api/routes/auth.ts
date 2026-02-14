import { Router, Request, Response } from 'express';

const router = Router();

// Health check endpoint for auth service
router.get('/check', (_req: Request, res: Response) => {
  return res.json({ 
    status: 'ok', 
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

export default router;
