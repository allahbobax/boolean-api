import { Router, Request, Response } from 'express';
import { PRODUCTS } from '../lib/products.js';

const router = Router();

// Get all products or single product
router.get('/', (req: Request, res: Response) => {
  const id = req.query.id as string | undefined;

  if (id) {
    const product = PRODUCTS.find(p => p.id === id);
    if (!product) {
      return res.json({ success: false, message: 'Продукт не найден' });
    }
    return res.json({ success: true, data: product });
  }

  return res.json({ success: true, data: PRODUCTS });
});

export default router;