import { Router, Request, Response } from "express";

const usersRouter = Router();

usersRouter.get("/:id", (req: Request, res: Response) => {
  res.json({ id: req.params.id });
});

usersRouter.delete("/:id", (req: Request, res: Response) => {
  res.status(204).send();
});

export default usersRouter;
