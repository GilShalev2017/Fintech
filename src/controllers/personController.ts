import { Request, Response, NextFunction } from "express";
import * as personService from "../services/personService";

// GET /tasks
export const getPersons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userIds } = req.body;
    const persons = await personService.getPersons(userIds);
    res.status(200).json({ success: true, count: persons.length, persons });
  } catch (error) {
    next(error);
  }
};