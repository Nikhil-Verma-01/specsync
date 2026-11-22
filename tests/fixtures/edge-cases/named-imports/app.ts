import express from "express";
import { usersRouter } from "./routes/users";

const { ordersRouter } = require("./routes/orders");

const app = express();

app.use("/users", usersRouter);
app.use("/orders", ordersRouter);

export default app;
