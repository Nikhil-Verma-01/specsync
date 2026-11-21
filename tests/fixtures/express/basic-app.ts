import express from "express";

const app = express();

app.get("/users", (req, res) => res.json([]));
app.post("/users", (req, res) => res.status(201).json({}));
app.get("/users/:id", (req, res) => res.json({}));
app.put("/users/:id", (req, res) => res.json({}));
app.delete("/users/:id", (req, res) => res.status(204).send());

app.get("/health", (req, res) => res.json({ status: "ok" }));

export default app;
