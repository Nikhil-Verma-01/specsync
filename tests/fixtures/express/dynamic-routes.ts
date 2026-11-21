import express from "express";

const app = express();
const SOME_VAR = "/computed";

// Dynamic path — should be reported as DYNAMIC_ROUTE limitation
app.get(SOME_VAR, (req, res) => res.json({}));

// Template literal — also dynamic, cannot be statically resolved
const base = "/api";
app.post(`${base}/items`, (req, res) => res.json({}));

export default app;
