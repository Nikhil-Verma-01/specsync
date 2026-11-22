import express from "express";

const app = express();
const dynamicEndpoint = process.env.DYNAMIC_PATH || "/dynamic-endpoint";

app.get("/users", (req, res) => {
  res.json([]);
});

// Dynamic route variable that cannot be resolved statically
app.get(dynamicEndpoint, (req, res) => {
  res.json({ dynamic: true });
});

export default app;
