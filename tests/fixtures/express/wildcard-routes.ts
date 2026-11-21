import express from "express";

const app = express();

// Wildcard — should be reported as UNSUPPORTED_PATTERN
app.get("/files/*", (req, res) => res.json({}));

// Regex-like — also UNSUPPORTED_PATTERN
app.get("/old(s)?", (req, res) => res.json({}));

export default app;
