import express, { Request, Response } from "express";

const app = express();

app.get("/api/v2/products", (req: Request, res: Response) => {
  res.json({ products: [] });
});

app.delete("/api/v2/products/:id", (req: Request, res: Response) => {
  res.status(204).send();
});

export default app;
