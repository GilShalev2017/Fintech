import { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────
// 🚨 GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
// Express identifies this as an error-handling middleware because it has
// exactly 4 parameters (err, req, res, next). It MUST be registered last
// in server.ts, after all routes and other middleware.
//
// Any route or middleware that calls next(error) lands here.
// Also catches errors thrown inside async route handlers if you use
// express-async-errors (recommended) or wrap handlers in try/catch.

interface CustomError extends Error {
  statusCode?: number;
  code?: number;                              // MongoDB error code (e.g. 11000 = duplicate key)
  errors?: Record<string, { message: string }>; // Mongoose ValidationError shape
}

const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Start with the raw error, then override fields as we classify it below.
  let statusCode = err.statusCode || 500;
  let message = err.message || "Server Error";

  // ── Structured logging ───────────────────────────────────────────────────
  // Log method + url so you know which endpoint triggered the error,
  // making log-searching significantly faster in production.
  console.error(`[${req.method}] ${req.originalUrl} →`, err);

  // ── Mongoose: bad ObjectId ───────────────────────────────────────────────
  // Happens when an :id param isn't a valid MongoDB ObjectId format.
  // e.g. GET /api/hotels/not-an-id
  if (err.name === "CastError") {
    message = "Resource not found";
    statusCode = 404;
  }

  // ── Mongoose: duplicate key ──────────────────────────────────────────────
  // MongoDB error code 11000 fires when a unique-indexed field
  // (e.g. email) already exists in the collection.
  if (err.code === 11000) {
    message = "Duplicate field value entered";
    statusCode = 400;
  }

  // ── Mongoose: validation error ───────────────────────────────────────────
  // Fires when a document fails schema-level validation before saving.
  // err.errors is a map of field → validation message; we join them all.
  if (err.name === "ValidationError") {
    message = Object.values(err.errors ?? {})
      .map((val) => val.message)
      .join(", ");
    statusCode = 400;
  }

  // ── JWT errors ───────────────────────────────────────────────────────────
  // These shouldn't normally reach here (protect middleware handles them),
  // but act as a safety net in case protect is bypassed or misconfigured.
  if (err.name === "JsonWebTokenError") {
    message = "Not authorized, token invalid";
    statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    message = "Not authorized, token expired";
    statusCode = 401;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    // Only expose the stack trace in development — never leak it in production.
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export default errorHandler;