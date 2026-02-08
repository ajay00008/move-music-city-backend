import { z } from 'zod';

/** Allowed grade values; must match admin UI and teacher grade options. Only these are stored to avoid corrupted data. */
const VALID_GRADES = new Set([
  'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade',
  '5th Grade', '6th Grade', '7th Grade', '8th Grade',
  '9th Grade', '10th Grade', '11th Grade', '12th Grade',
  '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th',
]);

/** Normalize "5" -> "5th Grade", "10" -> "10th Grade", etc. so client can send numeric or label. */
function toGradeLabel(s: string): string {
  const t = s.trim();
  if (VALID_GRADES.has(t)) return t;
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return t;
  if (n === 1) return '1st Grade';
  if (n === 2) return '2nd Grade';
  if (n === 3) return '3rd Grade';
  return `${n}th Grade`;
}

function normalizeGrades(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (Array.isArray(v)) {
    const cleaned = v
      .map((x) => (typeof x === 'string' ? toGradeLabel(x) : ''))
      .filter((s) => s && VALID_GRADES.has(s));
    return cleaned.length ? cleaned.join(',') : null;
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const parts = trimmed
      .split(',')
      .map((s) => toGradeLabel(s))
      .filter((s) => s && VALID_GRADES.has(s));
    return parts.length ? parts.join(',') : null;
  }
  return null;
}

export const createGradeGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  label: z.string().min(1, 'Label is required'),
  schoolId: z.string().uuid().optional(),
  grades: z.union([z.string(), z.array(z.string())]).optional().transform((v) => normalizeGrades(v)),
  classIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateGradeGroupSchema = z.object({
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  grades: z.union([z.string(), z.array(z.string()), z.null()]).optional().transform((v) => normalizeGrades(v)),
  classIds: z.array(z.string().uuid()).optional(),
});

export const createPrizeSchema = z.object({
  name: z.string().min(1, 'Prize name is required'),
  description: z.string().min(1, 'Description is required'),
  minutesRequired: z.number().int().min(0, 'Minutes required must be non-negative'),
  icon: z.string().min(1, 'Icon is required'),
  gradeGroupId: z.string().min(1, 'Grade group ID is required'),
  schoolId: z.string().uuid().optional(), // Optional for super admin, auto-set for school admin
});

export const updatePrizeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  minutesRequired: z.number().int().min(0).optional(),
  icon: z.string().min(1).optional(),
  gradeGroupId: z.string().min(1).optional(),
});

export const markPrizeDeliveredSchema = z.object({
  delivered: z.boolean(),
});
