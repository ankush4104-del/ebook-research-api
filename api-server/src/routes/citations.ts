import { Router, type IRouter } from "express";
import { CitationsBody } from "@workspace/api-zod";
import { findAndFormatCitations, type CitationStyle } from "../lib/citations";

const router: IRouter = Router();

router.post("/citations", async (req, res): Promise<void> => {
  const parsed = CitationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic, style } = parsed.data;
  const result = await findAndFormatCitations(topic, style as CitationStyle);
  res.json(result);
});

export default router;
