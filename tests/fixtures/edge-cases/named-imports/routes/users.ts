import { Router, Request, Response } from "express";

export const usersRouter = Router();

usersRouter.get("/", (req: Request, res: Response) => {
  res.json({ users: [] });
});

usersRouter.get("/:id", (req: Request, res: Response) => {
  res.json({ id: req.params.id });
});
