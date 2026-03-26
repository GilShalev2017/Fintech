import { Task } from "../models/task";

// In-memory task array
const tasks: Task[] = [
  { id: 1, title: "Task A", completed: false, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, title: "Task B", completed: true, createdAt: new Date(), updatedAt: new Date() },
];

// Get all tasks
export const getAllTasks = async (): Promise<Task[]> => {
  return tasks;
};

// Create a new task
export const createTaskService = async (title: string): Promise<Task> => {
  const nextId = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  const task: Task = {
    id: nextId,
    title,
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  tasks.push(task);
  return task;
};

// Update a task (mark completed)
export const updateTaskService = async (taskId: number, completed: boolean): Promise<Task | null> => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;

  task.completed = completed;
  task.updatedAt = new Date();
  return task;
};

// Delete a task
export const deleteTaskService = async (taskId: number): Promise<boolean> => {
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

//Get Filtered Tasks
interface GetTasksOptions {
  page?: number;
  limit?: number;
  completed?: boolean;
  title?: string;
  sortBy?: keyof Task;
  order?: "asc" | "desc";
}

export const getFilteredTasksService = async (options: GetTasksOptions): Promise<{ data: Task[]; total: number }> => {
  let result = [...tasks];

  // Filtering
  if (options.completed !== undefined) {
    result = result.filter(t => t.completed === options.completed);
  }

  if (options.title) {
    result = result.filter(t =>  t.title.toLowerCase().includes(options.title!.toLowerCase()));
  }

  // Sorting
  if (options.sortBy) {
    result.sort((a, b) => {
      const fieldA = a[options.sortBy!];
      const fieldB = b[options.sortBy!];

      if (fieldA < fieldB) return options.order === "desc" ? 1 : -1;
      if (fieldA > fieldB) return options.order === "desc" ? -1 : 1;
      return 0;
    });
  }

  const total = result.length;

  // Pagination
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const start = (page - 1) * limit;
  const end = start + limit;

  result = result.slice(start, end);

  return { data: result, total };
};