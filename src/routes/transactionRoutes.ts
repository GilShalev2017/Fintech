import express, { NextFunction, Request, Response } from "express";
import * as transactionController from "../controllers/transactionController";
import { body, param, validationResult } from "express-validator";

const router = express.Router();


export default router;