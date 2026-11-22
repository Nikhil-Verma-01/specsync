const { Router } = require("express");

const ordersRouter = Router();

ordersRouter.post("/", (req, res) => {
  res.status(201).json({ id: "order_123" });
});

ordersRouter.get("/:orderId", (req, res) => {
  res.json({ id: req.params.orderId });
});

module.exports = { ordersRouter };
