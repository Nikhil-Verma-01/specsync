import express, { Router } from "express";

const sub1 = Router();
sub1.get("/alpha", (req, res) => res.send("alpha"));

const sub2 = Router();
sub2.get("/beta", (req, res) => res.send("beta"));

const api = Router()
  .use("/a", sub1)
  .use("/b", sub2);

const app = express();
app.use("/api", api);

export default app;
