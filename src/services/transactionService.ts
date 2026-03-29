// ─────────────────────────────────────────────────────────────
// In-memory stores (replace with Redis + PostgreSQL in production)

import { v4 as uuidv4 } from "uuid";
import { PoolClient } from "pg";
import connectRedis, { cacheHelper, getRedisClient } from "../connections/redis";
import pool from "../connections/postgres";

// ─────────────────────────────────────────────────────────────
const accounts = new Map([
  ["checking-123", 1000], // initial balance
  ["savings-456", 500],
]);

//equals to
//const accounts = new Map();
//accounts.set("checking-123", 1000);
//accounts.set("savings-456", 500);

// For demo: simulate network delay
const simulateDelay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

export const transferMoney = async (
  fromAccount: string,
  toAccount: string,
  amount: number,
  transferReason: string,
): Promise<{
  fromAccount: string;
  toAccount: string;
  amount: number;
  transactionId: string;
  message: string;
  transferReason: string;
  newFromBalance: number;
  newToBalance: number;
} | null> => {
  const fromBalance = accounts.get(fromAccount);

  const toBalance = accounts.get(toAccount);

  if (!fromBalance || !toBalance) {
    throw new Error("Account not found");
  }

  if (fromBalance < amount) {
    throw new Error("Insufficient funds");
  }

  //Start "atomic" operation (in real app → DB transaction)
  try {
    await simulateDelay(); // simulate DB/network

    accounts.set(fromAccount, fromBalance - amount);
    accounts.set(toAccount, toBalance + amount);

    const transactionId = uuidv4();

    return {
      fromAccount,
      toAccount,
      amount,
      transactionId,
      message: "Transaction completed successfully",
      transferReason,
      newFromBalance: accounts.get(fromAccount)!,
      newToBalance: accounts.get(toAccount)!,
    };
  } catch (error) {
    console.error("Transfer failed:", error);
    throw error;
  }
};

// export function getBalances(): Promise<{ [key: string]: number }> {
//   return Promise.resolve(Object.fromEntries(accounts));
// }


// We will ensure Redis is connected when the service is first used

let redisClientInitialized = false;

const ensureRedisConnected = async () => {
  if (!redisClientInitialized) {
    await connectRedis();           // This initializes the singleton from your redis.ts
    redisClientInitialized = true;
  }
};

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours for successful transfers

/**
 * Atomic money transfer using PostgreSQL transaction + Redis idempotency
 * 
 * ❗ If Redis loses the key → your system can double-charge ❗❗❗
 */
export const transferMoneyWithRedisAndPostgres = async (
  fromAccount: string,
  toAccount: string,
  amount: number,
  transferReason: string = "No reason provided",
  idempotencyKey: string
): Promise<{
  transactionId: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  newFromBalance: number;
  newToBalance: number;
  message: string;
}> => {
  // ❗ If Redis loses the key → your system can double-charge ❗❗❗the key needs to be persisted to the DB!
  if (amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  // Ensure Redis is connected (safe to call multiple times)
  await ensureRedisConnected();

  const redis = getRedisClient();
  const idempotencyKeyFull = `idempotency:transfer:${idempotencyKey}`;

  // 1. Fast idempotency check using your cacheHelper (or direct redis)
  if (redis?.isOpen) {
    const cached = await cacheHelper.get<any>(idempotencyKeyFull);
    if (cached) {
      console.log(`[IDEMPOTENT] Returning cached result for key: ${idempotencyKey}`);
      if (cached.error) throw new Error(cached.error);
      return cached;
    }
  }

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();        // ← Using your postgres pool
    await client.query("BEGIN");

    // 2. Pessimistic locking to prevent race conditions
    const accountsRes = await client.query(
      `SELECT account_id, balance 
       FROM accounts 
       WHERE account_id IN ($1, $2) 
       FOR UPDATE`,
      [fromAccount, toAccount]
    );

    if (accountsRes.rowCount !== 2) {
      throw new Error("One or both accounts not found");
    }

    const fromRow = accountsRes.rows.find((r: any) => r.account_id === fromAccount);
    const toRow = accountsRes.rows.find((r: any) => r.account_id === toAccount);

    const fromBalance = parseFloat(fromRow.balance);
    const toBalance = parseFloat(toRow.balance);

    if (fromBalance < amount) {
      throw new Error("Insufficient funds");
    }

    const newFromBalance = fromBalance - amount;
    const newToBalance = toBalance + amount;

    // 3. Update balances atomically
    await client.query(
      `UPDATE accounts SET balance = $1 WHERE account_id = $2`,
      [newFromBalance, fromAccount]
    );

    await client.query(
      `UPDATE accounts SET balance = $1 WHERE account_id = $2`,
      [newToBalance, toAccount]
    );

    const transactionId = uuidv4();

    // 4. Audit log (recommended)
    await client.query(
      `INSERT INTO transactions 
       (transaction_id, from_account, to_account, amount, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [transactionId, fromAccount, toAccount, amount, transferReason]
    );

    await client.query("COMMIT");

    const result = {
      transactionId,
      fromAccount,
      toAccount,
      amount,
      newFromBalance,
      newToBalance,
      message: "Transaction completed successfully",
    };

    // 5. Cache successful result in Redis using your helper
    if (redis?.isOpen) {
      await cacheHelper.set(idempotencyKeyFull, result, IDEMPOTENCY_TTL_SECONDS);
    }

    console.log(`[SUCCESS] Transfer ${transactionId} completed using idempotency key: ${idempotencyKey}`);

    return result;

  } catch (error: any) {
    if (client) {
      try {
        await client.query("ROLLBACK");
        console.warn(`[ROLLBACK] Transaction rolled back: ${error.message}`);
      } catch (rbError) {
        console.error("Failed to rollback:", rbError);
      }
    }

    // Cache error for short time to prevent retry storms
    if (redis?.isOpen) {
      await cacheHelper.set(
        idempotencyKeyFull,
        { error: error.message },
        60 // 1 minute for errors
      );
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Keep the old simple in-memory version if you still need it for testing
export const getBalances = async (): Promise<{ [key: string]: number }> => {
  try {
    const result = await pool.query("SELECT account_id, balance FROM accounts");
    return result.rows.reduce((acc: any, row: any) => {
      acc[row.account_id] = parseFloat(row.balance);
      return acc;
    }, {});
  } catch (error) {
    console.error("Failed to fetch balances:", error);
    return {};
  }
};