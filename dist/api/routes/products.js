"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const products_1 = require("../lib/products");
const router = (0, express_1.Router)();
// Get all products or single product
router.get('/', (req, res) => {
    const id = req.query.id;
    if (id) {
        const product = products_1.PRODUCTS.find(p => p.id === id);
        if (!product) {
            return res.json({ success: false, message: 'Продукт не найден' });
        }
        return res.json({ success: true, data: product });
    }
    return res.json({ success: true, data: products_1.PRODUCTS });
});
exports.default = router;
