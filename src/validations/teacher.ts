import { z } from 'zod';

export const createTeacherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone is required'),
  grade: z.string().default(''), // Derived from assigned grades (classes) when classIds provided
  studentCount: z.number().int().min(0).default(0),
  schoolId: z.string().min(1, 'School ID is required'),
  classIds: z.array(z.string()).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  grade: z.string().optional(),
  studentCount: z.number().int().min(0).optional(),
  schoolId: z.string().uuid().nullable().optional(),
  classIds: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
});
