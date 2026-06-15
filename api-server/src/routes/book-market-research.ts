import { Router, type IRouter } from "express";
import { BookMarketResearchBody } from "@workspace/api-zod";
import { analyzeBookMarket } from "../lib/book-market-research";

const router: IRouter = Router();

router.post("/book-market-research", async (req, res): Promise<void> => {
  const parsed = BookMarketResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await analyzeBookMarket(parsed.data.topic);
  res.json(result);
});

export default router;
