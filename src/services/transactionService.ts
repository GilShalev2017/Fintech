// ─────────────────────────────────────────────────────────────
// In-memory stores (replace with Redis + PostgreSQL in production)

import { v4 as uuidv4 } from "uuid";

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

export function getBalances(): Promise<{ [key: string]: number }> {
  return Promise.resolve(Object.fromEntries(accounts));
}
