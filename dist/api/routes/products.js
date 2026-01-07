import { Router } from 'express';
import { PRODUCTS } from '../lib/products';
const router = Router();
// Get all products or single product
router.get('/', (req, res) => {
    const id = req.query.id;
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
