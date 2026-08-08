import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import clientsRouter from "./clients";
import commentsRouter from "./comments";
import conversationsRouter from "./conversations";
import filesRouter from "./files";
import kbRouter from "./kb";
import logEntriesRouter from "./log-entries";
import chronicleRouter from "./chronicle";
import adminRouter from "./admin";
import inviteRouter from "./invite";
import libraryRouter from "./library";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(inviteRouter);
router.use(projectsRouter);
router.use(clientsRouter);
router.use(commentsRouter);
router.use(conversationsRouter);
router.use(filesRouter);
router.use(kbRouter);
router.use(logEntriesRouter);
router.use(chronicleRouter);
router.use(adminRouter);
router.use(libraryRouter);

export default router;
