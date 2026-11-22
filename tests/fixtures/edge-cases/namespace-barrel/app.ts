import express from "express";
import * as routes from "../barrel-exports/routes/index.js";

const app = express();
app.use("/api/users", routes.usersRouter);
app.use("/api/orders", routes.ordersRouter);

export default app;
