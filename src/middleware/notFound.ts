import { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────
// 🔍 NOT FOUND MIDDLEWARE
// ─────────────────────────────────────────────
// Registered AFTER all valid routes in server.ts, BEFORE errorHandler.
// Any request that didn't match a route falls through to here.
//
// Why not just use errorHandler for 404s?
// Because "route not found" is not an unexpected error — it's a known,
// predictable outcome. Keeping it separate makes errorHandler cleaner
// and avoids polluting your error logs with routine 404s.
//
// Note: we don't call next() here — we respond directly, since there's
// nothing more to do for an unmatched route.
export const notFound = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
};