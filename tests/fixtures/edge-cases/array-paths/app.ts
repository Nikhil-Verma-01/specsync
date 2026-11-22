import express, { Request, Response } from "express";

const app = express();

app.get(["/users", "/accounts"], (req: Request, res: Response) => {
  res.json({ list: [] });
});

app.post(["/v1/auth", "/v2/auth"], (req: Request, res: Response) => {
  res.json({ token: "xyz" });
});

const cacheRouter = express.Router();
cacheRouter.delete(["/cache", "/temp"], (req: Request, res: Response) => {
  res.status(204).send();
});

app.use("/admin", cacheRouter);

export default app;
