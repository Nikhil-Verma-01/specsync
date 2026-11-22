import express from "express";

const app = express();

const subRouter1 = express.Router();
subRouter1.get("/ping", (req, res) => res.send("ping"));

const subRouter2 = express.Router();
subRouter2.get("/pong", (req, res) => res.send("pong"));

app.use("/test", subRouter1).use("/test", subRouter2);

export default app;
