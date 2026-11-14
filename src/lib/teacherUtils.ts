import type { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { Teacher } from '../entities/Teacher';
import type { GradeGroup } from '../entities/GradeGroup';

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

/** Prefer M2M grade groups; fall back to legacy singular gradeGroupId. */
export function resolveTeacherGradeGroupIds(teacher: {
  gradeGroupId?: string | null;
  gradeGroups?: Array<{ id: string }> | null;
}): string[] {
  if ((teacher.gradeGroups?.length ?? 0) > 0) {
    return teacher.gradeGroups!.map((g) => g.id);
  }
  return teacher.gradeGroupId ? [teacher.gradeGroupId] : [];
}

/** Primary grade group used for progress / add-minutes. */
export function resolvePrimaryGradeGroupId(teacher: {
  gradeGroupId?: string | null;
  gradeGroups?: Array<{ id: string }> | null;
}): string | null {
  if (teacher.gradeGroupId) return teacher.gradeGroupId;
  const ids = resolveTeacherGradeGroupIds(teacher);
  return ids[0] ?? null;
}

export async function findActiveTeacherByEmail(
  teacherRepo: Repository<Teacher>,
  email: string
): Promise<Teacher | null> {
  return teacherRepo.findOne({
    where: { email: email.toLowerCase(), deletedAt: IsNull() },
    relations: ['gradeGroups'],
  });
}

/**
 * Find the best soft-deleted teacher row for an email so we can revive it
 * instead of creating a new UUID (which breaks existing app JWTs).
 */
export async function findSoftDeletedTeacherByEmail(
  teacherRepo: Repository<Teacher>,
  email: string
): Promise<Teacher | null> {
  const rows = await teacherRepo.find({
    where: { email: email.toLowerCase() },
    withDeleted: true,
    relations: ['gradeGroups'],
  });
  const deleted = rows.filter((t) => t.deletedAt != null);
  if (deleted.length === 0) return null;
  deleted.sort((a, b) => {
    const minutesDiff = (b.fitnessMinutes ?? 0) - (a.fitnessMinutes ?? 0);
    if (minutesDiff !== 0) return minutesDiff;
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  });
  return deleted[0];
}

export function applyGradeGroupsToTeacher(
  teacher: Teacher,
  gradeGroups: GradeGroup[]
): void {
  if (gradeGroups.length === 0) {
    teacher.gradeGroupId = null;
    teacher.grade = '';
    teacher.gradeGroups = [];
    return;
  }
  const primary = gradeGroups[0];
  teacher.gradeGroupId = primary.id;
  teacher.grade = primary.label || primary.name || teacher.grade || '';
  teacher.gradeGroups = gradeGroups;
}
