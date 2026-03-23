import { Router, type IRouter } from "express";
import healthRouter from "./health";
import busRouter from "./bus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(busRouter);

export default router;
