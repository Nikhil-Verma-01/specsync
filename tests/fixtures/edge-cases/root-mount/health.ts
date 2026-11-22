import { Router } from "express";

const healthRouter = Router();
healthRouter.get("/health", (req, res) => res.json({ status: "ok" }));
healthRouter.get("/live", (req, res) => res.send("live"));

export default healthRouter;
