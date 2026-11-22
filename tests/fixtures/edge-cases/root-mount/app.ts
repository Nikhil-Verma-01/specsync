import express from "express";
import healthRouter from "./health";

const app = express();

// Root mount without prefix argument: app.use(router)
app.use(healthRouter);

export default app;
