import { Router, type IRouter } from "express";
import { KdpResearchBody } from "@workspace/api-zod";
import { researchKdp } from "../lib/kdp";

const router: IRouter = Router();

router.post("/kdp-research", async (req, res): Promise<void> => {
  const parsed = KdpResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic, book_type, target_audience } = parsed.data;

  const result = await researchKdp(topic, book_type, target_audience);
  res.json(result);
});

export default router;
