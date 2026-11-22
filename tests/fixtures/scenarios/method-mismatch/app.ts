import express from "express";

const app = express();

app.post("/orders", (req, res) => {
  res.status(201).json({});
});

export default app;
