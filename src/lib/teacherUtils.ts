import type { Teacher } from '../entities/Teacher';

/**
 * Resolve primary teacher name from a list of class-teacher links.
 * Returns the first non-deleted teacher with a non-empty name, or a fallback label.
 */
export function getPrimaryTeacherName(
  classTeachers: Array<{ teacher?: Teacher | null }>,
  fallback = 'No teacher assigned'
): string {
  const withName = classTeachers.find(
    (ct) =>
      ct.teacher &&
      ct.teacher.deletedAt == null &&
      ct.teacher.name?.trim()
  );
  return withName?.teacher?.name?.trim() ?? fallback;
}
