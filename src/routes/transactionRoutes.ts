import express, { NextFunction, Request, Response } from "express";
import { getBalances, transferMoney } from "../controllers/transactionController";
import { body, param, validationResult } from "express-validator";

const router = express.Router();

router.post("/", transferMoney);

router.get('/balances', getBalances);

export default router;