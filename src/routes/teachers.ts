import { Router } from 'express';
import { getTeacherRepository, getSchoolRepository, getGradeGroupRepository, getPrizeRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureSchoolAdminSchool } from '../middleware/validateSchoolAccess';
import { validate } from '../middleware/validate';
import { createTeacherSchema, updateTeacherSchema } from '../validations/teacher';
import { addMinutesSchema } from '../validations/class';
import { hashPassword } from '../lib/utils';
import { IsNull, ILike, Not } from 'typeorm';
import { Status as TeacherStatus } from '../entities/Teacher';

const FALLBACK_STEP = 100;
function getCumulativeThresholds(prizes: { minutesRequired: number }[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const p of prizes) {
    sum += p.minutesRequired;
    out.push(sum);
  }
  return out;
}
function getSegmentProgress(
  fitnessMinutes: number,
  earnedPrizesCount: number,
  prizes: { minutesRequired: number }[]
): { currentSegmentMinutes: number; minutesForNextPrize: number } {
  if (!prizes.length) {
    return { currentSegmentMinutes: fitnessMinutes % FALLBACK_STEP, minutesForNextPrize: FALLBACK_STEP };
  }
  const cumulative = getCumulativeThresholds(prizes);
  const prevThreshold = earnedPrizesCount > 0 ? cumulative[earnedPrizesCount - 1] : 0;
  const nextThreshold =
    earnedPrizesCount < cumulative.length ? cumulative[earnedPrizesCount] : cumulative[cumulative.length - 1];
  const segmentSize = nextThreshold - prevThreshold;
  const inSegment = fitnessMinutes - prevThreshold;
  const currentSegmentMinutes =
    segmentSize > 0 ? Math.min(Math.max(0, inSegment), segmentSize) : fitnessMinutes % FALLBACK_STEP;
  return {
    currentSegmentMinutes,
    minutesForNextPrize: segmentSize > 0 ? segmentSize : FALLBACK_STEP,
  };
}

export const teacherRoutes = Router();

// Get all teachers
teacherRoutes.get('/', authenticate, ensureSchoolAdminSchool, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId, search, status, page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const teacherRepo = getTeacherRepository();

    let where: any = {
      deletedAt: IsNull(),
    };

    // School admins can only see their school's teachers
    if (req.user?.role === 'school_admin') {
      where.schoolId = req.user.schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where = [
        { ...where, name: ILike(`%${search}%`) },
        { ...where, email: ILike(`%${search}%`) },
      ];
    }

    const [teachers, total] = await Promise.all([
      teacherRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        order: { createdAt: 'DESC' },
      }),
      teacherRepo.count({ where }),
    ]);

    const formattedTeachers = teachers.map((teacher) => {
      const { password: _pw, signupCode: _sc, phone: _p, ...rest } = teacher;
      return rest;
    });

    res.json({
      data: formattedTeachers,
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

// Get current teacher's progress (fitness minutes + earned count by grade group prizes). Teacher-only.
teacherRoutes.get('/me/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'teacher') {
      throw new AppError('Forbidden - Teachers only', 403);
    }
    const teacherRepo = getTeacherRepository();
    const prizeRepo = getPrizeRepository();
    const teacher = await teacherRepo.findOne({
      where: { id: req.user!.id, deletedAt: IsNull() },
      select: ['id', 'fitnessMinutes', 'earnedPrizesCount', 'gradeGroupId'],
    });
    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }
    const totalMinutes = teacher.fitnessMinutes ?? 0;
    const earnedPrizesCount = teacher.earnedPrizesCount ?? 0;
    let prizes: { minutesRequired: number }[] = [];
    if (teacher.gradeGroupId) {
      const list = await prizeRepo.find({
        where: { gradeGroupId: teacher.gradeGroupId, deletedAt: IsNull() },
        order: { minutesRequired: 'ASC', createdAt: 'ASC' },
        select: ['minutesRequired'],
      });
      prizes = list;
    }
    const { currentSegmentMinutes, minutesForNextPrize } = getSegmentProgress(totalMinutes, earnedPrizesCount, prizes);
    res.json({
      success: true,
      data: {
        fitnessMinutes: totalMinutes,
        earnedPrizesCount,
        currentSegmentMinutes,
        minutesForNextPrize,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Add minutes for current teacher (grade-group flow). Teacher-only.
teacherRoutes.post(
  '/me/add-minutes',
  authenticate,
  validate(addMinutesSchema),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.user?.role !== 'teacher') {
        throw new AppError('Forbidden - Teachers only', 403);
      }
      const { minutes } = req.body;
      const teacherRepo = getTeacherRepository();
      const prizeRepo = getPrizeRepository();
      const teacher = await teacherRepo.findOne({
        where: { id: req.user!.id, deletedAt: IsNull() },
      });
      if (!teacher || !teacher.gradeGroupId) {
        throw new AppError('Teacher or grade group not found', 404);
      }
      const newFitnessMinutes = (teacher.fitnessMinutes ?? 0) + minutes;
      const prizes = await prizeRepo.find({
        where: { gradeGroupId: teacher.gradeGroupId, deletedAt: IsNull() },
        order: { minutesRequired: 'ASC', createdAt: 'ASC' },
        select: ['id', 'minutesRequired'],
      });
      const cumulative = getCumulativeThresholds(prizes);
      let newEarnedCount = 0;
      for (let i = 0; i < cumulative.length; i++) {
        if (newFitnessMinutes >= cumulative[i]) newEarnedCount = i + 1;
      }
      await teacherRepo.update(
        { id: teacher.id },
        { fitnessMinutes: newFitnessMinutes, earnedPrizesCount: newEarnedCount }
      );
      const { currentSegmentMinutes, minutesForNextPrize } = getSegmentProgress(newFitnessMinutes, newEarnedCount, prizes);
      res.json({
        success: true,
        data: {
          fitnessMinutes: newFitnessMinutes,
          earnedPrizesCount: newEarnedCount,
          currentSegmentMinutes,
          minutesForNextPrize,
        },
        newEarnedPrizes: newEarnedCount - (teacher.earnedPrizesCount ?? 0),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Leaderboard: teachers in the same grade group as the current teacher (ordered by fitnessMinutes desc). Teacher-only.
teacherRoutes.get('/me/leaderboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'teacher') {
      throw new AppError('Forbidden - Teachers only', 403);
    }
    const teacherRepo = getTeacherRepository();
    const current = await teacherRepo.findOne({
      where: { id: req.user!.id, deletedAt: IsNull() },
      select: ['id', 'gradeGroupId', 'schoolId'],
    });
    if (!current || !current.gradeGroupId || current.schoolId == null) {
      return res.json({ data: [] });
    }
    const schoolId = current.schoolId as string;
    const teachers = await teacherRepo.find({
      where: {
        gradeGroupId: current.gradeGroupId,
        schoolId,
        deletedAt: IsNull(),
        status: TeacherStatus.ACTIVE,
      },
      select: ['id', 'name', 'grade', 'fitnessMinutes', 'earnedPrizesCount'],
      order: { fitnessMinutes: 'DESC', earnedPrizesCount: 'DESC' },
    });
    const data = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      grade: t.grade ?? '',
      fitnessMinutes: t.fitnessMinutes ?? 0,
      earnedPrizesCount: t.earnedPrizesCount ?? 0,
    }));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// Get teacher by ID
teacherRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const teacherRepo = getTeacherRepository();

    const teacher = await teacherRepo.findOne({
      where: {
        id,
        deletedAt: IsNull(),
      },
    });

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    if (req.user?.role === 'teacher' && req.user.id !== id) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    if (
      req.user?.role === 'school_admin' &&
      teacher.schoolId != null &&
      req.user.schoolId !== teacher.schoolId
    ) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const { password: _pw, signupCode: _sc, phone: _p, ...rest } = teacher;
    res.json({
      data: rest,
    });
  } catch (error) {
    next(error);
  }
});

// Create teacher
teacherRoutes.post(
  '/',
  authenticate,
  ensureSchoolAdminSchool,
  validate(createTeacherSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { name, email, studentCount, schoolId, gradeGroupId, status } = req.body;
      const teacherRepo = getTeacherRepository();
      const schoolRepo = getSchoolRepository();
      const gradeGroupRepo = getGradeGroupRepository();

      const resolvedSchoolId = schoolId || req.user?.schoolId;
      if (!resolvedSchoolId) {
        throw new AppError('School is required', 400);
      }

      const school = await schoolRepo.findOne({
        where: { id: resolvedSchoolId, deletedAt: IsNull() },
      });
      if (!school) {
        throw new AppError('School not found', 404);
      }

      const gradeGroup = await gradeGroupRepo.findOne({
        where: { id: gradeGroupId, deletedAt: IsNull() },
      });
      if (!gradeGroup) {
        throw new AppError('Grade group not found', 404);
      }

      const existing = await teacherRepo.findOne({
        where: { email: email.toLowerCase(), deletedAt: IsNull() },
      });
      if (existing) {
        throw new AppError('Teacher with this email already exists', 400);
      }

      const gradeLabel = gradeGroup.label || gradeGroup.name || '';

      const teacher = teacherRepo.create({
        name,
        email: email.toLowerCase(),
        phone: '',
        grade: gradeLabel,
        studentCount: studentCount ?? 0,
        schoolId: resolvedSchoolId,
        gradeGroupId,
        status: status || 'active',
      });
      if (req.body.password) {
        teacher.password = await hashPassword(req.body.password);
      }
      const savedTeacher = await teacherRepo.save(teacher);
      const { password: _pw, signupCode: _sc, phone: _p, ...teacherData } = savedTeacher;

      res.status(201).json({
        success: true,
        data: teacherData,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update teacher
teacherRoutes.put(
  '/:id',
  authenticate,
  validate(updateTeacherSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const updateData: any = { ...req.body };
      delete updateData.phone; // not collected or displayed
      const teacherRepo = getTeacherRepository();

      // Get existing teacher
      const existing = await teacherRepo.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!existing) {
        throw new AppError('Teacher not found', 404);
      }

      // School admins can update their school's teachers or unassigned teachers (claim by setting schoolId); teachers can only update themselves
      if (
        req.user?.role === 'school_admin' &&
        existing.schoolId != null &&
        req.user.schoolId !== existing.schoolId
      ) {
        throw new AppError('Forbidden - Access denied', 403);
      }
      if (req.user?.role === 'teacher' && req.user.id !== id) {
        throw new AppError('Forbidden - You can only update your own profile', 403);
      }

      // Handle email uniqueness
      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase();
        const emailExists = await teacherRepo.findOne({
          where: {
            email: updateData.email,
            id: Not(id),
            deletedAt: IsNull(),
          },
        });

        if (emailExists) {
          throw new AppError('Email already in use', 400);
        }
      }

      if (updateData.password !== undefined) {
        if (updateData.password === null || updateData.password === '') {
          existing.password = null;
        } else {
          existing.password = await hashPassword(updateData.password);
        }
        delete updateData.password;
      }

      // When claiming an unassigned teacher (setting schoolId), invalidate signup code so it cannot be reused
      if (updateData.schoolId != null && existing.schoolId == null) {
        updateData.signupCode = null;
      }

      // Handle grade group: set grade from grade group label
      if (updateData.gradeGroupId !== undefined) {
        if (updateData.gradeGroupId) {
          const gradeGroupRepo = getGradeGroupRepository();
          const gradeGroup = await gradeGroupRepo.findOne({
            where: { id: updateData.gradeGroupId, deletedAt: IsNull() },
          });
          if (gradeGroup) {
            updateData.grade = gradeGroup.label || gradeGroup.name || '';
          }
        } else {
          updateData.grade = updateData.grade ?? '';
        }
      }

      if (updateData.classIds !== undefined) delete updateData.classIds;

      // Update teacher
      Object.assign(existing, updateData);
      const updatedTeacher = await teacherRepo.save(existing);
      const { password: _pw2, signupCode: _sc2, phone: _p2, ...updatedData } = updatedTeacher;

      res.json({
        success: true,
        data: updatedData,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete teacher (soft delete). Teachers can delete their own account; school admins can delete their school's teachers.
teacherRoutes.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const teacherRepo = getTeacherRepository();

    const teacher = await teacherRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    const isSelfDelete = req.user?.role === 'teacher' && req.user.id === id;
    const isSchoolAdminDeletingOwnSchool =
      req.user?.role === 'school_admin' &&
      teacher.schoolId != null &&
      req.user.schoolId === teacher.schoolId;

    if (!isSelfDelete && !isSchoolAdminDeletingOwnSchool) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    teacher.deletedAt = new Date();
    await teacherRepo.save(teacher);

    res.json({
      success: true,
      message: 'Teacher deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});
