import { z } from 'zod';

export const createTeacherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  grade: z.string().default(''),
  studentCount: z.number().int().min(0).default(0),
  schoolId: z.string().uuid().optional(),
  /** Single grade group (backward compat); use gradeGroupIds when creating with multiple. */
  gradeGroupId: z.string().uuid().optional(),
  /** One or more grade groups. Use gradeGroupIds for multiple, or gradeGroupId for one. At least one required. */
  gradeGroupIds: z.array(z.string().uuid()).optional(),
  classIds: z.array(z.string()).optional().default([]),
  status: z.enum(['active', 'inactive']).default('active'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  grade: z.string().optional(),
  studentCount: z.number().int().min(0).optional(),
  schoolId: z.string().uuid().nullable().optional(),
  gradeGroupId: z.string().uuid().nullable().optional(),
  gradeGroupIds: z.array(z.string().uuid()).optional(),
  classIds: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
});
