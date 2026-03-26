import { Request, Response, NextFunction } from "express";
import * as taskService from "../services/taskService";

// GET /tasks
export const getTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = await taskService.getAllTasks();
    res.status(200).json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    next(error);
  }
};

// POST /tasks
export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const task = await taskService.createTaskService(title);
    res.status(201).json({ success: true, task });
  } catch (error) {
    next(error);
  }
};

// PATCH /tasks/:id
export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = Number(req.params.id);
    const { completed } = req.body;

    // Business validation
    if (isNaN(taskId) || taskId < 1) {
      return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    const task = await taskService.updateTaskService(taskId, completed);

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    res.status(200).json({ success: true, task });
  } catch (error) {
    next(error);
  }
};

// DELETE /tasks/:id
export const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = Number(req.params.id);

    if (isNaN(taskId) || taskId < 1) {
      return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    const deleted = await taskService.deleteTaskService(taskId);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const getFilteredTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {page, limit, completed, title, sortBy, order} = req.query;

    const result = await taskService.getFilteredTasksService({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      completed: completed !== undefined ? completed === "true" : undefined,
      title: title as string,
      sortBy: sortBy as any,
      order: order as "asc" | "desc",
    });

    res.status(200).json({
      success: true,
      total: result.total,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};