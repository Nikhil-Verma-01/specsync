import express from "express";

const app = express();

app.get("/users", (req, res) => {
  res.json([]);
});

app.post("/users", (req, res) => {
  res.status(201).json({});
});

app.get("/users/:id", (req, res) => {
  res.json({ id: req.params.id });
});

export default app;
