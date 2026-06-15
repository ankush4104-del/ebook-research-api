import { Router, type IRouter } from "express";
import { ResearchBody } from "@workspace/api-zod";
import { performResearch } from "../lib/research";

const router: IRouter = Router();

router.post("/research", async (req, res): Promise<void> => {
  const parsed = ResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic, book_type, target_audience } = parsed.data;

  const result = await performResearch(topic, book_type, target_audience);
  res.json(result);
});

export default router;
