import { Router, type IRouter } from "express";
import healthRouter from "./health";
import researchRouter from "./research";
import outlineRouter from "./outline";
import citationsRouter from "./citations";
import kdpResearchRouter from "./kdp-research";
import bookMarketResearchRouter from "./book-market-research";
import kdpKeywordsRouter from "./kdp-keywords";
import chapterResearchRouter from "./chapter-research";

const router: IRouter = Router();

router.use(healthRouter);
router.use(researchRouter);
router.use(outlineRouter);
router.use(citationsRouter);
router.use(kdpResearchRouter);
router.use(bookMarketResearchRouter);
router.use(kdpKeywordsRouter);
router.use(chapterResearchRouter);

export default router;
