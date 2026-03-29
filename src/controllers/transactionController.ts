import { Request, Response, NextFunction } from "express";
import * as transactionService from "../services/transactionService";
import { transferMoneyWithRedisAndPostgres } from "../services/transactionService";

const idempotencyStore = new Map(); // key → { status, result, timestamp }

// export const transferMoney = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const idempotencyKey = req.headers["idempotency-key"];

//   if (!idempotencyKey) {
//     return res
//       .status(400)
//       .json({ error: "idempotency-key header is required" });
//   }

//   console.log(`[REQUEST] Idempotency-Key: ${idempotencyKey}`);

//   // 1. Check if we already processed this request
//   const existing = idempotencyStore.get(idempotencyKey);

//   if (existing) {
//     console.log(`[IDEMPOTENT] Duplicate detected → returning cached result`);
//     return res.status(existing.result.statusCode).json(existing.result.body);
//   }

//   const { fromAccount, toAccount, amount, transferReason } = req.body;

//   // Basic validation
//   if (!fromAccount || !toAccount || !amount || amount <= 0) {
//     return res.status(400).json({ error: "Invalid transaction data" });
//   }

//   try {
//     const tranfserDetails = await transactionService.transferMoney(
//       fromAccount,
//       toAccount,
//       amount,
//       transferReason,
//     );

//     if (!tranfserDetails) {
//       return res.status(500).json({
//         success: false,
//         error: "Transaction failed - no details returned",
//       });
//     }

//     const successResponse = {
//       statusCode: 201,
//       body: {
//         success: true,
//         transactionId: tranfserDetails.transactionId,
//         fromAccount: tranfserDetails.fromAccount,
//         toAccount: tranfserDetails.toAccount,
//         amount: tranfserDetails.amount,
//         description: tranfserDetails.transferReason,
//         newFromBalance: tranfserDetails.newFromBalance,
//         newToBalance: tranfserDetails.newToBalance,
//         message: tranfserDetails.message,
//       },
//     };

//     // 2. Record idempotency (only after successful processing)
//     idempotencyStore.set(idempotencyKey, {
//       status: "completed",
//       result: successResponse,
//       timestamp: Date.now(),
//     });

//     console.log(
//       `[SUCCESS] Transaction ${tranfserDetails.transactionId} processed`,
//     );

//     res.status(201).json(successResponse.body);
//   } catch (error: any) {
//     console.error("[ERROR]", error.message);

//     // Still store failed attempts so retries get the same error
//     idempotencyStore.set(idempotencyKey, {
//       status: "failed",
//       result: {
//         statusCode: 400,
//         body: { success: false, error: error.message },
//       },
//       timestamp: Date.now(),
//     });

//     res.status(400).json({ success: false, error: error.message });

//     //TODO maybe supply a custom error, but adjuts the errorHandler
//     next(error);
//   }
// };

export const getBalances = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const balances = await transactionService.getBalances();

    res.status(200).json(balances);
  } catch (error: any) {
    console.error("[ERROR]", error.message);

    res.status(400).json({ success: false, error: error.message });

    next(error);
  }
};

export const transferMoney = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;

  if (!idempotencyKey) {
    return res
      .status(400)
      .json({ error: "idempotency-key header is required" });
  }

  console.log("Headers:", req.headers);
  console.log("Body:", req.body); // If this says 'undefined', the middleware is missing

  const { fromAccount, toAccount, amount, transferReason } = req.body;

  if (!fromAccount || !toAccount || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid transaction data" });
  }

  try {
    const result = await transferMoneyWithRedisAndPostgres(
      fromAccount,
      toAccount,
      Number(amount),
      transferReason,
      idempotencyKey,
    );

    return res.status(201).json({
      success: true,
      transactionId: result.transactionId,
      fromAccount: result.fromAccount,
      toAccount: result.toAccount,
      amount: result.amount,
      newFromBalance: result.newFromBalance,
      newToBalance: result.newToBalance,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[Transfer Error]", error.message);

    const statusCode =
      error.message.includes("Insufficient funds") ||
      error.message.includes("not found")
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};
