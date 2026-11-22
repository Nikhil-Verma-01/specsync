import express, { Request, Response, NextFunction } from "express";

const app = express();

const auth = (req: Request, res: Response, next: NextFunction) => next();
const validate = (req: Request, res: Response, next: NextFunction) => next();
const audit = (req: Request, res: Response, next: NextFunction) => next();
const rateLimiter = (req: Request, res: Response, next: NextFunction) => next();

// Direct route with 3 middleware functions before handler
app.get("/items", auth, validate, audit, (req: Request, res: Response) => {
  res.json({ items: [] });
});

// Nested router mounted with multiple middlewares
const itemsRouter = express.Router();
itemsRouter.post("/create", validate, (req: Request, res: Response) => {
  res.status(201).json({ success: true });
});

app.use("/api", rateLimiter, auth, itemsRouter);

export default app;
