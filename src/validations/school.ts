import { z } from 'zod';

export const createSchoolSchema = z.object({
  name: z.string().min(1, 'School name is required'),
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
