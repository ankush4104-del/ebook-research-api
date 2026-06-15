import { Router, type IRouter } from "express";
import { OutlineBody } from "@workspace/api-zod";
import { buildOutline, type BookType, type BookLength } from "../lib/outline";

const router: IRouter = Router();

router.post("/outline", async (req, res): Promise<void> => {
  const parsed = OutlineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { topic, book_type, target_audience, length } = parsed.data;
  const result = await buildOutline(
    topic,
    book_type as BookType,
    target_audience,
    length as BookLength
  );
  res.json(result);
});

export default router;
