import { Router } from 'express';
import { getEarnedPrizeRepository, getTeacherRepository } from '../lib/repositories';
import { emitSchoolPrizeDelivered } from '../socket/emitter';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { markPrizeDeliveredSchema } from '../validations/prize';
import { In, IsNull } from 'typeorm';

export const earnedPrizeRoutes = Router();

type TeacherForLookup = {
  name: string;
  schoolId: string | null;
  gradeGroupId: string | null;
  gradeGroups?: Array<{ id: string }>;
};

const getClassTeacherName = (classItem?: { teachers?: Array<{ teacher?: { name?: string | null } | null }> } | null) => {
  return classItem?.teachers?.map((ct) => ct.teacher?.name?.trim()).find((name) => !!name) ?? null;
};

const buildTeacherNameIndex = (teachers: TeacherForLookup[]) => {
  const index = new Map<string, Map<string, string>>();
  for (const teacher of teachers) {
    const schoolId = teacher.schoolId;
    const teacherName = teacher.name?.trim();
    if (!schoolId || !teacherName) continue;
    const gradeGroupIds = new Set<string>();
    if (teacher.gradeGroupId) {
      gradeGroupIds.add(teacher.gradeGroupId);
    }
    for (const gg of teacher.gradeGroups ?? []) {
      if (gg.id) gradeGroupIds.add(gg.id);
    }
    if (gradeGroupIds.size === 0) continue;
    if (!index.has(schoolId)) {
      index.set(schoolId, new Map<string, string>());
    }
    const schoolIndex = index.get(schoolId)!;
    for (const gradeGroupId of gradeGroupIds) {
      if (!schoolIndex.has(gradeGroupId)) {
        schoolIndex.set(gradeGroupId, teacherName);
      }
    }
  }
  return index;
};

const resolveTeacherName = (
  schoolId: string | null | undefined,
  gradeGroupId: string | undefined,
  teacherNameFromRow: string | null | undefined,
  classItem: { teachers?: Array<{ teacher?: { name?: string | null } | null }> } | null | undefined,
  teacherIndex: Map<string, Map<string, string>>
) => {
  if (teacherNameFromRow?.trim()) return teacherNameFromRow.trim();
  if (schoolId && gradeGroupId) {
    const schoolIndex = teacherIndex.get(schoolId);
    const gradeGroupTeacherName = schoolIndex?.get(gradeGroupId);
    if (gradeGroupTeacherName) return gradeGroupTeacherName;
  }
  return getClassTeacherName(classItem);
};

// Get all earned prizes
earnedPrizeRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId, classId, delivered, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const earnedPrizeRepo = getEarnedPrizeRepository();

    const base = { deletedAt: IsNull() };
    let where: any = base;

    // School admins and teachers see their school's earned prizes
    if (req.user?.role === 'school_admin' || req.user?.role === 'teacher') {
      // When prizes are made global, `earned_prizes.schoolId` can end up null.
      // Fall back to the associated class's `schoolId`.
      where = [
        { ...base, schoolId: req.user.schoolId },
        { ...base, class: { schoolId: req.user.schoolId } },
      ];
    } else if (schoolId) {
      where = { ...base, schoolId };
    }

    if (classId) {
      if (Array.isArray(where)) {
        where = where.map((w: any) => ({ ...w, classId }));
      } else {
        where.classId = classId;
      }
    }

    if (delivered !== undefined) {
      if (Array.isArray(where)) {
        where = where.map((w: any) => ({ ...w, delivered: delivered === 'true' }));
      } else {
        where.delivered = delivered === 'true';
      }
    }

    const [earnedPrizes, total] = await Promise.all([
      earnedPrizeRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        relations: ['prize', 'prize.gradeGroup', 'teacher', 'class', 'class.teachers', 'class.teachers.teacher'],
        order: { earnedAt: 'DESC' },
      }),
      earnedPrizeRepo.count({ where }),
    ]);

    const teacherRepo = getTeacherRepository();
    const schoolIds = Array.from(
      new Set(earnedPrizes.map((ep) => ep.schoolId ?? ep.class?.schoolId).filter((id): id is string => !!id))
    );
    const teachers =
      schoolIds.length > 0
        ? await teacherRepo.find({
            where: {
              schoolId: schoolIds.length === 1 ? schoolIds[0] : In(schoolIds),
              deletedAt: IsNull(),
            } as any,
            relations: ['gradeGroups'],
            select: ['id', 'name', 'schoolId', 'gradeGroupId'],
          })
        : [];
    const teacherIndex = buildTeacherNameIndex(teachers as TeacherForLookup[]);

    const formatted = earnedPrizes.map((ep) => {
      const schoolIdForRow = ep.schoolId ?? ep.class?.schoolId ?? null;
      return {
        id: ep.id,
        prizeId: ep.prizeId,
        classId: ep.classId,
        className: ep.class?.name ?? '—',
        gradeGroupId: ep.prize?.gradeGroupId ?? null,
        gradeGroupName: ep.prize?.gradeGroup?.label || ep.prize?.gradeGroup?.name || '—',
        teacherName: resolveTeacherName(schoolIdForRow, ep.prize?.gradeGroupId, ep.teacher?.name, ep.class, teacherIndex),
        studentCount: ep.class?.studentCount ?? 0,
        schoolId: schoolIdForRow,
        earnedAt: ep.earnedAt.toISOString().split('T')[0],
        delivered: ep.delivered,
      };
    });

    res.json({
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get earned prize by ID
earnedPrizeRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const earnedPrizeRepo = getEarnedPrizeRepository();

    const earnedPrize = await earnedPrizeRepo.findOne({
      where: {
        id,
        deletedAt: IsNull(),
      },
      relations: ['prize', 'prize.gradeGroup', 'teacher', 'class', 'class.teachers', 'class.teachers.teacher'],
    });

    if (!earnedPrize) {
      throw new AppError('Earned prize not found', 404);
    }

    if (req.user?.role === 'school_admin') {
      // `earned_prizes.schoolId` can be null; fall back to the class's schoolId.
      const schoolIdForAccess = earnedPrize.schoolId ?? earnedPrize.class?.schoolId;
      if (req.user.schoolId !== schoolIdForAccess) {
        throw new AppError('Forbidden - Access denied', 403);
      }
    }

    const teacherRepo = getTeacherRepository();
    const schoolIdForRow = earnedPrize.schoolId ?? earnedPrize.class?.schoolId ?? null;
    const teachers =
      schoolIdForRow != null
        ? await teacherRepo.find({
            where: { schoolId: schoolIdForRow, deletedAt: IsNull() },
            relations: ['gradeGroups'],
            select: ['id', 'name', 'schoolId', 'gradeGroupId'],
          })
        : [];
    const teacherIndex = buildTeacherNameIndex(teachers as TeacherForLookup[]);

    const formatted = {
      id: earnedPrize.id,
      prizeId: earnedPrize.prizeId,
      classId: earnedPrize.classId,
      className: earnedPrize.class?.name ?? '—',
      gradeGroupId: earnedPrize.prize?.gradeGroupId ?? null,
      gradeGroupName: earnedPrize.prize?.gradeGroup?.label || earnedPrize.prize?.gradeGroup?.name || '—',
      teacherName: resolveTeacherName(schoolIdForRow, earnedPrize.prize?.gradeGroupId, earnedPrize.teacher?.name, earnedPrize.class, teacherIndex),
      studentCount: earnedPrize.class?.studentCount ?? 0,
      schoolId: schoolIdForRow,
      earnedAt: earnedPrize.earnedAt.toISOString().split('T')[0],
      delivered: earnedPrize.delivered,
    };

    res.json({ data: formatted });
  } catch (error) {
    next(error);
  }
});

// Mark prize as delivered
earnedPrizeRoutes.patch(
  '/:id',
  authenticate,
  validate(markPrizeDeliveredSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const { delivered } = req.body;
      const earnedPrizeRepo = getEarnedPrizeRepository();

      const earnedPrize = await earnedPrizeRepo.findOne({
        where: {
          id,
          deletedAt: IsNull(),
        },
        relations: ['class', 'teacher'],
      });

      if (!earnedPrize) {
        throw new AppError('Earned prize not found', 404);
      }

      // School admins can only update their school's earned prizes
      const schoolIdForAccess = earnedPrize.schoolId ?? earnedPrize.class?.schoolId ?? earnedPrize.teacher?.schoolId ?? null;
      if (req.user?.role === 'school_admin' && req.user.schoolId !== schoolIdForAccess) {
        throw new AppError('Forbidden - Access denied', 403);
      }

      earnedPrize.delivered = delivered;
      const updated = await earnedPrizeRepo.save(earnedPrize);

      const updatedWithRelations = await earnedPrizeRepo.findOne({
        where: { id },
        relations: ['prize', 'prize.gradeGroup', 'teacher', 'class', 'class.teachers', 'class.teachers.teacher'],
      });
      const teacherRepo = getTeacherRepository();
      const schoolIdForRow = updated.schoolId ?? updatedWithRelations?.class?.schoolId ?? null;
      const teachers =
        schoolIdForRow != null
          ? await teacherRepo.find({
              where: { schoolId: schoolIdForRow, deletedAt: IsNull() },
              relations: ['gradeGroups'],
              select: ['id', 'name', 'schoolId', 'gradeGroupId'],
            })
          : [];
      const teacherIndex = buildTeacherNameIndex(teachers as TeacherForLookup[]);
      const formatted = {
        id: updated.id,
        prizeId: updated.prizeId,
        classId: updated.classId,
        className: updatedWithRelations?.class?.name || '—',
        gradeGroupId: updatedWithRelations?.prize?.gradeGroupId ?? null,
        gradeGroupName:
          updatedWithRelations?.prize?.gradeGroup?.label ||
          updatedWithRelations?.prize?.gradeGroup?.name ||
          '—',
        teacherName: resolveTeacherName(
          schoolIdForRow,
          updatedWithRelations?.prize?.gradeGroupId,
          updatedWithRelations?.teacher?.name,
          updatedWithRelations?.class,
          teacherIndex
        ),
        studentCount: updatedWithRelations?.class?.studentCount ?? 0,
        schoolId: schoolIdForRow,
        earnedAt: updated.earnedAt.toISOString().split('T')[0],
        delivered: updated.delivered,
      };

      emitSchoolPrizeDelivered({
        schoolId: updated.schoolId ?? updatedWithRelations?.class?.schoolId ?? updatedWithRelations?.teacher?.schoolId ?? '',
        earnedPrizeId: updated.id,
        delivered: updated.delivered,
      });

      res.json({
        success: true,
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  }
);
