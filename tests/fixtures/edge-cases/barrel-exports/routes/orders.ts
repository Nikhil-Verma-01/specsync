import express from "express";

export const ordersRouter = express.Router();

ordersRouter.post("/", (req, res) => {
  res.json({ orderId: "123" });
});

ordersRouter.get("/:orderId", (req, res) => {
  res.json({ orderId: req.params.orderId });
});
