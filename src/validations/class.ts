import { z } from 'zod';

export const createClassSchema = z.object({
  name: z.string().min(1, 'Class name is required'),
  grade: z.string().min(1, 'Grade is required'),
  section: z.string().min(1, 'Section is required'),
  schoolId: z.string().min(1, 'School ID is required'),
  teacherIds: z.array(z.string()).default([]),
  studentCount: z.number().int().min(0).default(0),
  fitnessMinutes: z.number().int().min(0).default(0),
});

export const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  grade: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  teacherIds: z.array(z.string()).optional(),
  studentCount: z.number().int().min(0).optional(),
  fitnessMinutes: z.number().int().min(0).optional(),
});

export const addMinutesSchema = z.object({
  minutes: z.number().int().min(1, 'Minutes must be at least 1'),
});
