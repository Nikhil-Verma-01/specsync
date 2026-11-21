import express from "express";
import usersRouter from "./users-router.js";

const app = express();

// Cross-file router mount — the USP test case
// usersRouter is defined in users-router.ts and mounted here at /api/users
app.use("/api/users", usersRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
