import express from "express";

const router = express.Router();

router.get("/", (req, res) => res.json([]));
router.post("/", (req, res) => res.status(201).json({}));
router.get("/:id", (req, res) => res.json({}));
router.delete("/:id", (req, res) => res.status(204).send());

export default router;
