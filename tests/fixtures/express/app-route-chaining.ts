import express from "express";

const app = express();

// app.route() chaining pattern
app.route("/users")
  .get((req, res) => res.json([]))
  .post((req, res) => res.status(201).json({}));

app.route("/users/:id")
  .get((req, res) => res.json({}))
  .put((req, res) => res.json({}))
  .delete((req, res) => res.status(204).send());

export default app;
