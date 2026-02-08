import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const teacherLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().regex(/^[0-9]{4,6}$/, 'OTP must be 4-6 digits'),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const teacherSignupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  /** Full phone with country code, e.g. +12025551234. Digits only after +, 10–15 chars. */
  phone: z
    .string()
    .min(10, 'Phone number is required')
    .max(16, 'Phone number too long')
    .regex(/^\+[0-9]{10,15}$/, 'Enter a valid number with country code (e.g. +1 2345678901)'),
});
