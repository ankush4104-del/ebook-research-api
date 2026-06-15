import { Router, type IRouter } from "express";
import { ChapterResearchBody } from "@workspace/api-zod";
import { researchChapter } from "../lib/chapter-research";

const router: IRouter = Router();

router.post("/chapter-research", async (req, res): Promise<void> => {
  const parsed = ChapterResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic, chapter_title, target_audience } = parsed.data;
  const result = await researchChapter(topic, chapter_title, target_audience);
  res.json(result);
});

export default router;
