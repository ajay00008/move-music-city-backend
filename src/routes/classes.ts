import { Router } from 'express';
import { getClassRepository, getSchoolRepository, getClassTeacherRepository, getEarnedPrizeRepository, getPrizeRepository } from '../lib/repositories';
import { getPrimaryTeacherName } from '../lib/teacherUtils';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureSchoolAdminSchool } from '../middleware/validateSchoolAccess';
import { validate } from '../middleware/validate';
import { createClassSchema, updateClassSchema, addMinutesSchema } from '../validations/class';
import { IsNull, ILike, In } from 'typeorm';
import { emitClassMinutesUpdated, emitSchoolPrizeEarned } from '../socket/emitter';

const FALLBACK_STEP = 100;

/** Cumulative minutes to earn prize at index i = sum(prizes[0..i].minutesRequired). One prize per step. */
function getCumulativeThresholds(prizes: { minutesRequired: number }[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const p of prizes) {
    sum += p.minutesRequired;
    out.push(sum);
  }
  return out;
}

/** Compute progress toward next prize: minutes in current segment and segment size (resets each prize). Uses cumulative thresholds so same-minute prizes are sequential (first at 100, second at 200, etc.). */
function getSegmentProgress(
  fitnessMinutes: number,
  earnedPrizesCount: number,
  prizes: { minutesRequired: number }[]
): { currentSegmentMinutes: number; minutesForNextPrize: number } {
  if (!prizes.length) {
    return {
      currentSegmentMinutes: fitnessMinutes % FALLBACK_STEP,
      minutesForNextPrize: FALLBACK_STEP,
    };
  }
  const cumulative = getCumulativeThresholds(prizes);
  const prevThreshold = earnedPrizesCount > 0 ? cumulative[earnedPrizesCount - 1] : 0;
  const nextThreshold =
    earnedPrizesCount < cumulative.length
      ? cumulative[earnedPrizesCount]
      : cumulative[cumulative.length - 1];
  const segmentSize = nextThreshold - prevThreshold;
  const inSegment = fitnessMinutes - prevThreshold;
  const currentSegmentMinutes =
    segmentSize > 0
      ? Math.min(Math.max(0, inSegment), segmentSize)
      : fitnessMinutes % FALLBACK_STEP;
  return {
    currentSegmentMinutes,
    minutesForNextPrize: segmentSize > 0 ? segmentSize : FALLBACK_STEP,
  };
}

export const classRoutes = Router();

// Get all classes (school_admin, teacher, super_admin)
classRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId, search, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const classRepo = getClassRepository();

    let where: any = {
      deletedAt: IsNull(),
    };

    if (req.user?.role === 'school_admin' || req.user?.role === 'teacher') {
      where.schoolId = req.user.schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }

    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [classes, total] = await Promise.all([
      classRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        order: { createdAt: 'DESC' },
      }),
      classRepo.count({ where }),
    ]);

    const classTeacherRepo = getClassTeacherRepository();
    const earnedPrizeRepo = getEarnedPrizeRepository();
    const prizeRepo = getPrizeRepository();

    const schoolIds = [...new Set(classes.map((c) => c.schoolId))];
    const allPrizes = schoolIds.length
      ? await prizeRepo.find({
          where: { schoolId: In(schoolIds), deletedAt: IsNull() },
          order: { minutesRequired: 'ASC', createdAt: 'ASC' },
        })
      : [];
    const prizesBySchool = allPrizes.reduce(
      (acc, p) => {
        if (p.schoolId) {
          if (!acc[p.schoolId]) acc[p.schoolId] = [];
          acc[p.schoolId].push(p);
        }
        return acc;
      },
      {} as Record<string, { minutesRequired: number }[]>
    );

    const formattedClasses = await Promise.all(
      classes.map(async (classItem) => {
        const classTeachers = await classTeacherRepo.find({
          where: { classId: classItem.id },
          relations: ['teacher'],
          order: { createdAt: 'ASC' },
        });
        const primaryName = getPrimaryTeacherName(classTeachers);
        const isCurrentTeacherClass =
          req.user?.role === 'teacher' &&
          req.user?.name &&
          classTeachers.some((ct) => ct.teacherId === req.user!.id);
        const displayTeacherName = isCurrentTeacherClass
          ? req.user!.name!
          : (primaryName === 'No teacher assigned' ? null : primaryName);
        const earnedCount = await earnedPrizeRepo.count({
          where: { classId: classItem.id, deletedAt: IsNull() },
        });
        const schoolPrizes = prizesBySchool[classItem.schoolId] ?? [];
        const { currentSegmentMinutes, minutesForNextPrize } = getSegmentProgress(
          classItem.fitnessMinutes,
          earnedCount,
          schoolPrizes
        );

        return {
          ...classItem,
          teacherIds: classTeachers.map((ct) => ct.teacherId),
          primaryTeacherName: displayTeacherName,
          earnedPrizesCount: earnedCount,
          currentSegmentMinutes,
          minutesForNextPrize,
        };
      })
    );

    res.json({
      data: formattedClasses,
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

// Add minutes to a class (teacher for their class, or school_admin for their school)
classRoutes.post(
  '/:id/add-minutes',
  authenticate,
  validate(addMinutesSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: classId } = req.params;
      const { minutes } = req.body;
      const classRepo = getClassRepository();
      const classTeacherRepo = getClassTeacherRepository();
      const earnedPrizeRepo = getEarnedPrizeRepository();
      const prizeRepo = getPrizeRepository();

      const classItem = await classRepo.findOne({
        where: { id: classId, deletedAt: IsNull() },
      });

      if (!classItem) {
        throw new AppError('Class not found', 404);
      }

      if (req.user?.role === 'teacher') {
        const link = await classTeacherRepo.findOne({
          where: { classId, teacherId: req.user.id },
        });
        if (!link) {
          throw new AppError('Forbidden - You can only add minutes to your own class', 403);
        }
      } else if (req.user?.role === 'school_admin' && req.user.schoolId !== classItem.schoolId) {
        throw new AppError('Forbidden - Access denied', 403);
      } else if (req.user?.role !== 'super_admin') {
        throw new AppError('Forbidden', 403);
      }

      const newFitnessMinutes = classItem.fitnessMinutes + minutes;
      classItem.fitnessMinutes = newFitnessMinutes;
      const savedClass = await classRepo.save(classItem);

      const schoolPrizes = await prizeRepo.find({
        where: { schoolId: classItem.schoolId, deletedAt: IsNull() },
        order: { minutesRequired: 'ASC', createdAt: 'ASC' },
      });
      const cumulative = getCumulativeThresholds(schoolPrizes);

      let newEarnedCount = 0;
      for (let i = 0; i < schoolPrizes.length; i++) {
        const threshold = cumulative[i];
        if (newFitnessMinutes < threshold) continue;
        const prize = schoolPrizes[i];
        const existing = await earnedPrizeRepo.findOne({
          where: { classId, prizeId: prize.id, deletedAt: IsNull() },
        });
        if (!existing) {
          await earnedPrizeRepo.save(
            earnedPrizeRepo.create({
              prizeId: prize.id,
              classId,
              schoolId: classItem.schoolId,
              earnedAt: new Date(),
            })
          );
          newEarnedCount += 1;
        }
      }

      const classTeachers = await classTeacherRepo.find({
        where: { classId },
        relations: ['teacher'],
        order: { createdAt: 'ASC' },
      });
      const isCurrentTeacherClass =
        req.user?.role === 'teacher' &&
        req.user?.name &&
        classTeachers.some((ct) => ct.teacherId === req.user!.id);
      const primaryName = isCurrentTeacherClass
        ? req.user!.name!
        : getPrimaryTeacherName(classTeachers);
      const displayTeacherName = primaryName === 'No teacher assigned' ? null : primaryName;
      const earnedCount = await earnedPrizeRepo.count({
        where: { classId, deletedAt: IsNull() },
      });

      const { currentSegmentMinutes, minutesForNextPrize } = getSegmentProgress(
        newFitnessMinutes,
        earnedCount,
        schoolPrizes
      );

      emitClassMinutesUpdated({
        classId,
        schoolId: classItem.schoolId,
        fitnessMinutes: newFitnessMinutes,
        earnedPrizesCount: earnedCount,
        newEarnedPrizes: newEarnedCount,
        primaryTeacherName: displayTeacherName,
      });
      if (newEarnedCount > 0) {
        emitSchoolPrizeEarned({
          schoolId: classItem.schoolId,
          classId,
          className: classItem.name,
          earnedPrizesCount: earnedCount,
          newEarnedPrizes: newEarnedCount,
        });
      }

      res.json({
        success: true,
        data: {
          ...savedClass,
          fitnessMinutes: newFitnessMinutes,
          primaryTeacherName: displayTeacherName,
          earnedPrizesCount: earnedCount,
          currentSegmentMinutes,
          minutesForNextPrize,
        },
        newEarnedPrizes: newEarnedCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get class by ID
classRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const classRepo = getClassRepository();
    const classTeacherRepo = getClassTeacherRepository();
    const earnedPrizeRepo = getEarnedPrizeRepository();

    const classItem = await classRepo.findOne({
      where: {
        id,
        deletedAt: IsNull(),
      },
    });

    if (!classItem) {
      throw new AppError('Class not found', 404);
    }

    // School admins can only see their school's classes; teachers only their assigned class
    if (req.user?.role === 'school_admin' && req.user.schoolId !== classItem.schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }
    if (req.user?.role === 'teacher') {
      const link = await classTeacherRepo.findOne({
        where: { classId: id, teacherId: req.user.id },
      });
      if (!link) {
        throw new AppError('Forbidden - Access denied', 403);
      }
    }

    const classTeachers = await classTeacherRepo.find({
      where: { classId: classItem.id },
      relations: ['teacher'],
      order: { createdAt: 'ASC' },
    });
    const isCurrentTeacherClass =
      req.user?.role === 'teacher' &&
      req.user?.name &&
      classTeachers.some((ct) => ct.teacherId === req.user!.id);
    const primaryName = isCurrentTeacherClass
      ? req.user!.name!
      : getPrimaryTeacherName(classTeachers);
    const displayTeacherName = primaryName === 'No teacher assigned' ? null : primaryName;
    const earnedPrizesCount = await earnedPrizeRepo.count({
      where: { classId: classItem.id, deletedAt: IsNull() },
    });

    const prizeRepo = getPrizeRepository();
    const schoolPrizes = await prizeRepo.find({
      where: { schoolId: classItem.schoolId, deletedAt: IsNull() },
      order: { minutesRequired: 'ASC', createdAt: 'ASC' },
    });
    const { currentSegmentMinutes, minutesForNextPrize } = getSegmentProgress(
      classItem.fitnessMinutes,
      earnedPrizesCount,
      schoolPrizes
    );

    res.json({
      data: {
        ...classItem,
        teacherIds: classTeachers.map((ct) => ct.teacherId),
        primaryTeacherName: displayTeacherName,
        earnedPrizesCount,
        currentSegmentMinutes,
        minutesForNextPrize,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create class
classRoutes.post(
  '/',
  authenticate,
  ensureSchoolAdminSchool,
  validate(createClassSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { name, grade, section, schoolId, teacherIds, studentCount, fitnessMinutes } = req.body;
      const classRepo = getClassRepository();
      const schoolRepo = getSchoolRepository();
      const classTeacherRepo = getClassTeacherRepository();

      // Verify school exists
      const school = await schoolRepo.findOne({
        where: {
          id: schoolId,
          deletedAt: IsNull(),
        },
      });

      if (!school) {
        throw new AppError('School not found', 404);
      }

      // Create class
      const classItem = classRepo.create({
        name,
        grade,
        section,
        schoolId,
        studentCount: studentCount || 0,
        fitnessMinutes: fitnessMinutes || 0,
      });

      const savedClass = await classRepo.save(classItem);

      // Create teacher relationships
      if (teacherIds && teacherIds.length > 0) {
        const classTeacherRecords = teacherIds.map((teacherId: string) =>
          classTeacherRepo.create({
            classId: savedClass.id,
            teacherId,
          })
        );
        await classTeacherRepo.save(classTeacherRecords);
      }

      // Fetch with relations for response
      const classTeachers = await classTeacherRepo.find({
        where: { classId: savedClass.id },
      });

      res.status(201).json({
        success: true,
        data: {
          ...savedClass,
          teacherIds: classTeachers.map((ct) => ct.teacherId),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update class
classRoutes.put(
  '/:id',
  authenticate,
  validate(updateClassSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const updateData: any = { ...req.body };
      const classRepo = getClassRepository();
      const classTeacherRepo = getClassTeacherRepository();

      // Get existing class
      const existing = await classRepo.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!existing) {
        throw new AppError('Class not found', 404);
      }

      // School admins can only update their school's classes; teachers only their assigned class
      if (req.user?.role === 'school_admin' && req.user.schoolId !== existing.schoolId) {
        throw new AppError('Forbidden - Access denied', 403);
      }
      if (req.user?.role === 'teacher') {
        const link = await classTeacherRepo.findOne({
          where: { classId: id, teacherId: req.user.id },
        });
        if (!link) {
          throw new AppError('Forbidden - You can only update your own class', 403);
        }
        // Teachers cannot change teacherIds
        delete updateData.teacherIds;
      }

      // Handle teacher relationships
      if (updateData.teacherIds !== undefined) {
        // Delete existing relationships
        await classTeacherRepo.delete({ classId: id });

        // Create new relationships
        if (updateData.teacherIds.length > 0) {
          const classTeacherRecords = updateData.teacherIds.map((teacherId: string) =>
            classTeacherRepo.create({
              classId: id,
              teacherId,
            })
          );
          await classTeacherRepo.save(classTeacherRecords);
        }

        delete updateData.teacherIds;
      }

      // Update class
      Object.assign(existing, updateData);
      const updatedClass = await classRepo.save(existing);

      // Get updated teacher relationships
      const classTeachers = await classTeacherRepo.find({
        where: { classId: updatedClass.id },
      });

      res.json({
        success: true,
        data: {
          ...updatedClass,
          teacherIds: classTeachers.map((ct) => ct.teacherId),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete class (soft delete)
classRoutes.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const classRepo = getClassRepository();

    const classItem = await classRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!classItem) {
      throw new AppError('Class not found', 404);
    }

    // School admins can only delete their school's classes
    if (req.user?.role === 'school_admin' && req.user.schoolId !== classItem.schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    classItem.deletedAt = new Date();
    await classRepo.save(classItem);

    res.json({
      success: true,
      message: 'Class deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});
