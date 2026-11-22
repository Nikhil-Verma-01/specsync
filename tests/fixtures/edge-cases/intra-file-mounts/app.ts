import express from "express";

const app = express();
const apiRouter = express.Router();
const v1Router = express.Router();

app.use("/api", apiRouter);
apiRouter.use("/v1", v1Router);

v1Router.get("/health", (req, res) => res.json({ status: "ok" }));
v1Router.post("/echo", (req, res) => res.json(req.body));
apiRouter.get("/ping", (req, res) => res.send("pong"));
app.get("/root-status", (req, res) => res.send("live"));

export default app;
