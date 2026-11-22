import express from "express";
import { usersRouter, ordersRouter } from "./routes/index.js";

const app = express();
app.use("/users", usersRouter);
app.use("/orders", ordersRouter);

export default app;
