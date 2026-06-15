import { Router, type IRouter } from "express";
import { KdpKeywordsBody } from "@workspace/api-zod";
import { researchKdpKeywords } from "../lib/kdp-keywords";

const router: IRouter = Router();

router.post("/kdp-keywords", async (req, res): Promise<void> => {
  const parsed = KdpKeywordsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await researchKdpKeywords(parsed.data.topic);
  res.json(result);
});

export default router;
