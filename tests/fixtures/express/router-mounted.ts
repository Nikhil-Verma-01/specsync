import express from "express";

const app = express();

// Intra-file router mount — router defined in same file
const ordersRouter = express.Router();
ordersRouter.get("/", (req, res) => res.json([]));
ordersRouter.post("/", (req, res) => res.status(201).json({}));
ordersRouter.get("/:orderId", (req, res) => res.json({}));

// Mount the router at a path prefix
app.use("/orders", ordersRouter);

export default app;
