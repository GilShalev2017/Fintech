import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user";
import { AuthRequest, JWTPayload } from "../types";

// ─────────────────────────────────────────────
// 🔐 protect — verifies JWT and attaches user to request
// ─────────────────────────────────────────────
// Applied to any route that requires a logged-in user.
// Reads the Bearer token from the Authorization header,
// verifies its signature, then fetches the user from DB.
//
// Why fetch the user on every request instead of just trusting the JWT?
// So we can check isActive — a disabled account's existing tokens are rejected
// immediately rather than staying valid until expiry.
export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Extract token from "Authorization: Bearer <token>" header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res
        .status(401)
        .json({
          success: false,
          message: "Not authorized to access this route",
        });
      return;
    }

    const token = authHeader.split(" ")[1];

    // jwt.verify throws if the token is expired, tampered with, or signed
    // with a different secret — we let the outer catch handle those cases.
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as JWTPayload;

    // Fetch fresh user data so role/isActive changes take effect immediately.
    // .select("-password") strips the hashed password from the attached object.
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      res.status(401).json({ success: false, message: "User not found" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: "Account is disabled" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    // Covers both JWT errors (JsonWebTokenError, TokenExpiredError)
    // and unexpected DB errors — keeps the response consistent.
    if (error instanceof jwt.JsonWebTokenError) {
      res
        .status(401)
        .json({ success: false, message: "Not authorized, token invalid" });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res
        .status(401)
        .json({ success: false, message: "Not authorized, token expired" });
      return;
    }
    // Unexpected error — pass to global errorHandler
    next(error);
  }
};

// ─────────────────────────────────────────────
// 🔑 authorize — restricts route to specific roles
// ─────────────────────────────────────────────
// Always used AFTER protect, since it relies on req.user being set.
// Usage: router.delete('/users/:id', protect, authorize('admin'), deleteUser)
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Role '${req.user?.role ?? "unknown"}' is not authorized to access this route`,
      });
      return;
    }
    next();
  };
};
