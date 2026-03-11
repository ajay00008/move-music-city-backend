import { Router } from 'express';
import { getPrizeRepository, getGradeGroupRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createPrizeSchema, updatePrizeSchema } from '../validations/prize';
import { In, IsNull, Not } from 'typeorm';
import { emitSchoolPrizeCreated, emitSchoolPrizeUpdated } from '../socket/emitter';

export const prizeRoutes = Router();

/** Normalize grade for comparison: "10th" and "10th Grade" match. */
function gradeMatchValue(grade: string): string {
  const t = grade.trim().toLowerCase();
  if (!t) return t;
  if (t.endsWith(' grade')) return t;
  if (/^\d{1,2}th$/.test(t)) return t + ' grade';
  return t;
}

/** Returns true if grade group applies to teacherGrade (grades is null/empty = all, else comma-separated list). Case-insensitive. */
function gradeGroupMatchesTeacher(gradeGroup: { grades: string | null }, teacherGrade: string): boolean {
  if (!teacherGrade || !teacherGrade.trim()) return true;
  const g = gradeGroup.grades?.trim();
  if (!g) return true; // no grades set = visible to all teachers in school
  const list = g.split(',').map((s) => s.trim()).filter(Boolean);
  const teacherNorm = gradeMatchValue(teacherGrade);
  return list.some((grade) => gradeMatchValue(grade) === teacherNorm);
}

// Get all prizes
prizeRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { gradeGroupId, classId, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const prizeRepo = getPrizeRepository();
    const gradeGroupRepo = getGradeGroupRepository();

    let where: any = {
      deletedAt: IsNull(),
    };

    // School admins and teachers see global prizes (schoolId null) + their school's prizes; super_admin sees all
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = In([req.user.schoolId, null]);
    } else if (req.user?.role === 'teacher' && req.user.schoolId) {
      where.schoolId = In([req.user.schoolId, null]);
      // Teachers: show prizes for all their assigned grade groups
      const teacherGradeGroupIds = req.user.teacherGradeGroupIds ?? [];
      if (teacherGradeGroupIds.length > 0) {
        where.gradeGroupId = In(teacherGradeGroupIds);
      } else {
        const teacherGradeGroupId = req.user.teacherGradeGroupId ?? null;
        if (teacherGradeGroupId) {
          where.gradeGroupId = teacherGradeGroupId;
        } else {
          const teacherGrade = req.user.teacherGrade ?? null;
          if (teacherGrade) {
            const schoolGradeGroups = await gradeGroupRepo.find({
              where: [{ schoolId: req.user!.schoolId!, deletedAt: IsNull() }, { schoolId: IsNull(), deletedAt: IsNull() }],
              select: ['id', 'grades'],
            });
            const matchingGradeGroupIds = schoolGradeGroups
              .filter((gg) => gradeGroupMatchesTeacher(gg, teacherGrade))
              .map((gg) => gg.id);
            if (schoolGradeGroups.length > 0) {
              where.gradeGroupId = In(matchingGradeGroupIds.length ? matchingGradeGroupIds : []);
            }
          }
        }
      }
    } else if (req.user?.role !== 'super_admin') {
      where.schoolId = Not(IsNull());
    }

    if (gradeGroupId) {
      where.gradeGroupId = gradeGroupId;
    }

    const [prizes, total] = await Promise.all([
      prizeRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        order: { minutesRequired: 'ASC', createdAt: 'ASC' },
      }),
      prizeRepo.count({ where }),
    ]);

    res.json({
      data: prizes,
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

// Get prize by ID
prizeRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const prizeRepo = getPrizeRepository();

    let where: any = {
      id,
      deletedAt: IsNull(),
    };

    // School admins can only see their school's prizes
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    }

    const prize = await prizeRepo.findOne({
      where,
    });

    if (!prize) {
      throw new AppError('Prize not found', 404);
    }

    res.json({ data: prize });
  } catch (error) {
    next(error);
  }
});

// Create prize
prizeRoutes.post(
  '/',
  authenticate,
  validate(createPrizeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { name, description, minutesRequired, icon, gradeGroupId, schoolId } = req.body;
      const prizeRepo = getPrizeRepository();
      const gradeGroupRepo = getGradeGroupRepository();

      // Only super_admin can create prizes (global or per-school)
      if (req.user?.role !== 'super_admin') {
        throw new AppError('Prizes are set at the super admin level. Contact your administrator.', 403);
      }

      // Verify grade group exists
      const gradeGroup = await gradeGroupRepo.findOne({
        where: { id: gradeGroupId, deletedAt: IsNull() },
      });

      if (!gradeGroup) {
        throw new AppError('Grade group not found', 404);
      }

      // Determine schoolId: use explicit body value, fall back to grade group's schoolId
      let targetSchoolId: string | null = schoolId !== undefined ? (schoolId ?? null) : (gradeGroup.schoolId ?? null);

      if (targetSchoolId && gradeGroup.schoolId !== null && gradeGroup.schoolId !== targetSchoolId) {
        throw new AppError('Grade group does not belong to this school', 403);
      }

      const prize = prizeRepo.create({
        name,
        description,
        minutesRequired,
        icon,
        gradeGroupId,
        schoolId: targetSchoolId,
      });

      const saved = await prizeRepo.save(prize);

      if (targetSchoolId) {
        emitSchoolPrizeCreated({
          schoolId: targetSchoolId,
          prizeId: saved.id,
          name: saved.name,
          gradeGroupId: gradeGroup.id,
          gradeGroupName: gradeGroup.name,
          minutesRequired: saved.minutesRequired,
          icon: saved.icon,
        });
      }

      res.status(201).json({
        success: true,
        data: saved,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update prize
prizeRoutes.put(
  '/:id',
  authenticate,
  validate(updatePrizeSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const prizeRepo = getPrizeRepository();
      const gradeGroupRepo = getGradeGroupRepository();

      let where: any = { id };
      // School admins can only update their school's prizes
      if (req.user?.role === 'school_admin' && req.user.schoolId) {
        where.schoolId = req.user.schoolId;
      }

      const prize = await prizeRepo.findOne({ where });
      if (!prize) {
        throw new AppError('Prize not found', 404);
      }

      // Verify grade group if being updated
      if (updateData.gradeGroupId) {
        let gradeGroupWhere: any = {
          id: updateData.gradeGroupId,
          deletedAt: IsNull(),
        };
        if (req.user?.role === 'school_admin') {
          gradeGroupWhere.schoolId = prize.schoolId;
        }

        const gradeGroup = await gradeGroupRepo.findOne({
          where: gradeGroupWhere,
        });

        if (!gradeGroup) {
          throw new AppError('Grade group not found', 404);
        }

        // Ensure grade group belongs to the same school
        if (gradeGroup.schoolId !== prize.schoolId) {
          throw new AppError('Grade group does not belong to this school', 403);
        }
      }

      // Don't allow changing schoolId
      delete updateData.schoolId;

      Object.assign(prize, updateData);
      const updated = await prizeRepo.save(prize);

      if (updated.schoolId) {
        const gradeGroup = await gradeGroupRepo.findOne({
          where: { id: updated.gradeGroupId, deletedAt: IsNull() },
        });
        emitSchoolPrizeUpdated({
          schoolId: updated.schoolId,
          prizeId: updated.id,
          name: updated.name,
          gradeGroupId: updated.gradeGroupId,
          gradeGroupName: gradeGroup?.name ?? '',
          minutesRequired: updated.minutesRequired,
          icon: updated.icon,
        });
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete prize (soft delete)
prizeRoutes.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const prizeRepo = getPrizeRepository();

    let where: any = { id };
    // School admins can only delete their school's prizes
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    }

    const prize = await prizeRepo.findOne({ where });
    if (!prize) {
      throw new AppError('Prize not found', 404);
    }

    prize.deletedAt = new Date();
    await prizeRepo.save(prize);

    res.json({
      success: true,
      message: 'Prize deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});
