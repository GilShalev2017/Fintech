import express, { NextFunction, Request, Response } from "express";
import * as taskController from "../controllers/taskController";
import { body, param, validationResult } from "express-validator";

const router = express.Router();

// Validation middleware
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({ field: err.type, message: err.msg })),
    });
  }
  next();
};

// GET /tasks
router.get("/", taskController.getTasks);

// POST /tasks
router.post(
  "/",
  body("title")
    .isString().withMessage("Title must be a string")
    .trim()
    .notEmpty().withMessage("Title is required"),
  validate,
  taskController.createTask,
);

// PATCH /tasks/:id
router.patch(
  "/:id",
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  body("completed").isBoolean().withMessage("completed must be boolean"),
  validate,
  taskController.updateTask,
);

// DELETE /tasks/:id
router.delete(
  "/:id",
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  validate,
  taskController.deleteTask,
);


// GET /tasks/filtered
router.get("/filtered", taskController.getFilteredTasks);

export default router;