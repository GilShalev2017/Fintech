import express, { NextFunction, Request, Response } from "express";
import * as personController from "../controllers/personController";
import { body, param, validationResult } from "express-validator";

const router = express.Router();

// GET /tasks
router.post("/", personController.getPersons);

export default router;