import express from "express";

const app = express();

app.get("/users", (req, res) => {
  res.json([]);
});

export default app;
