import { z } from 'zod';

export const createAdminSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  schoolId: z.string().min(1, 'School ID is required'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateAdminSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  schoolId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
