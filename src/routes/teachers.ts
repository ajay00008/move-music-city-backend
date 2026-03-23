import { Router } from 'express';
import { getTeacherRepository, getSchoolRepository, getGradeGroupRepository, getPrizeRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureSchoolAdminSchool } from '../middleware/validateSchoolAccess';
import { validate } from '../middleware/validate';
import { createTeacherSchema, updateTeacherSchema } from '../validations/teacher';
import { addMinutesSchema } from '../validations/class';
import { hashPassword } from '../lib/utils';
import { IsNull, ILike, Not, In } from 'typeorm';
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
/** Optional ?gradeGroupId= — must be one of the teacher's assigned groups; otherwise all assigned groups. */
function resolveLeaderboardGradeGroupFilter(
  myGradeGroupIds: string[],
  req: AuthRequest
): { ok: true; ids: string[] } | { ok: false; message: string } {
  const q = req.query.gradeGroupId;
  const requested =
    typeof q === 'string' && q.trim()
      ? q.trim()
      : Array.isArray(q) && typeof q[0] === 'string'
        ? q[0].trim()
        : undefined;
  if (!requested) {
    return { ok: true, ids: myGradeGroupIds };
  }
  if (!myGradeGroupIds.includes(requested)) {
    return { ok: false, message: 'gradeGroupId is not assigned to this teacher' };
  }
  return { ok: true, ids: [requested] };
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
        relations: ['gradeGroups'],
      }),
      teacherRepo.count({ where }),
    ]);

    const formattedTeachers = teachers.map((teacher) => {
      const { password: _pw, signupCode: _sc, phone: _p, gradeGroups: _gg, ...rest } = teacher;
      const gradeGroupIds = (teacher.gradeGroups ?? []).length > 0
        ? teacher.gradeGroups!.map((g) => g.id)
        : teacher.gradeGroupId
          ? [teacher.gradeGroupId]
          : [];
      return { ...rest, gradeGroupIds };
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

// Leaderboard compatibility:
// Some clients may call `/teachers/leaderboard` instead of `/teachers/me/leaderboard`.
// Provide this route so `/teachers/leaderboard` doesn't get matched by `/:id` (where `id="leaderboard"` causes a UUID cast error).
teacherRoutes.get('/leaderboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'teacher') {
      // Only teachers have a well-defined "my leaderboard" scope in the current app.
      return res.json({ data: [] });
    }

    const teacherRepo = getTeacherRepository();
    const current = await teacherRepo.findOne({
      where: { id: req.user!.id, deletedAt: IsNull() },
      relations: ['gradeGroups'],
    });
    if (!current || current.schoolId == null) {
      return res.json({ data: [] });
    }

    const schoolId = current.schoolId as string;
    const myGradeGroupIds =
      (current.gradeGroups?.length ?? 0) > 0
        ? current.gradeGroups!.map((g) => g.id)
        : current.gradeGroupId
          ? [current.gradeGroupId]
          : [];

    if (myGradeGroupIds.length === 0) {
      return res.json({ data: [] });
    }

    const resolved = resolveLeaderboardGradeGroupFilter(myGradeGroupIds, req);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.message });
    }
    const filterIds = resolved.ids;

    const teachers = await teacherRepo
      .createQueryBuilder('t')
      .leftJoin('t.gradeGroups', 'gg')
      .where('t.schoolId = :schoolId', { schoolId })
      .andWhere('t.deletedAt IS NULL')
      .andWhere('t.status = :status', { status: TeacherStatus.ACTIVE })
      .andWhere('(t.gradeGroupId IN (:...ids) OR gg.id IN (:...ids))', { ids: filterIds })
      .select(['t.id', 't.name', 't.grade', 't.fitnessMinutes', 't.earnedPrizesCount'])
      .orderBy('t.fitnessMinutes', 'DESC')
      .addOrderBy('t.earnedPrizesCount', 'DESC')
      .getMany();

    const seen = new Set<string>();
    const unique = teachers.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    const data = unique.map((t) => ({
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

// Leaderboard: teachers who share at least one grade group with the current teacher (same school). Teacher-only.
teacherRoutes.get('/me/leaderboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.user?.role !== 'teacher') {
      throw new AppError('Forbidden - Teachers only', 403);
    }
    const teacherRepo = getTeacherRepository();
    const current = await teacherRepo.findOne({
      where: { id: req.user!.id, deletedAt: IsNull() },
      relations: ['gradeGroups'],
    });
    if (!current || current.schoolId == null) {
      return res.json({ data: [] });
    }
    const schoolId = current.schoolId as string;
    const myGradeGroupIds =
      (current.gradeGroups?.length ?? 0) > 0
        ? current.gradeGroups!.map((g) => g.id)
        : current.gradeGroupId
          ? [current.gradeGroupId]
          : [];
    if (myGradeGroupIds.length === 0) {
      return res.json({ data: [] });
    }
    const resolved = resolveLeaderboardGradeGroupFilter(myGradeGroupIds, req);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.message });
    }
    const filterIds = resolved.ids;
    const teachers = await teacherRepo
      .createQueryBuilder('t')
      .leftJoin('t.gradeGroups', 'gg')
      .where('t.schoolId = :schoolId', { schoolId })
      .andWhere('t.deletedAt IS NULL')
      .andWhere('t.status = :status', { status: TeacherStatus.ACTIVE })
      .andWhere(
        '(t.gradeGroupId IN (:...ids) OR gg.id IN (:...ids))',
        { ids: filterIds }
      )
      .select(['t.id', 't.name', 't.grade', 't.fitnessMinutes', 't.earnedPrizesCount'])
      .orderBy('t.fitnessMinutes', 'DESC')
      .addOrderBy('t.earnedPrizesCount', 'DESC')
      .getMany();
    const seen = new Set<string>();
    const unique = teachers.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    const data = unique.map((t) => ({
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
      where: { id, deletedAt: IsNull() },
      relations: ['gradeGroups'],
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

    const { password: _pw, signupCode: _sc, phone: _p, gradeGroups: _gg, ...rest } = teacher;
    const gradeGroupIds = (teacher.gradeGroups ?? []).length > 0
      ? teacher.gradeGroups!.map((g) => g.id)
      : teacher.gradeGroupId
        ? [teacher.gradeGroupId]
        : [];
    res.json({
      data: { ...rest, gradeGroupIds },
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
      const { name, email, studentCount, schoolId, gradeGroupId, gradeGroupIds, status } = req.body;
      const teacherRepo = getTeacherRepository();
      const schoolRepo = getSchoolRepository();
      const gradeGroupRepo = getGradeGroupRepository();

      const ids = Array.isArray(gradeGroupIds) && gradeGroupIds.length > 0
        ? gradeGroupIds
        : gradeGroupId
          ? [gradeGroupId]
          : [];
      if (ids.length === 0) {
        throw new AppError('At least one grade group is required (gradeGroupId or gradeGroupIds)', 400);
      }

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

      const gradeGroups = await gradeGroupRepo.find({
        where: { id: In(ids), deletedAt: IsNull() },
      });
      if (gradeGroups.length !== ids.length) {
        throw new AppError('One or more grade groups not found', 404);
      }
      const primary = gradeGroups[0];
      const gradeLabel = primary.label || primary.name || '';

      const existing = await teacherRepo.findOne({
        where: { email: email.toLowerCase(), deletedAt: IsNull() },
      });
      if (existing) {
        throw new AppError('Teacher with this email already exists', 400);
      }

      const teacher = teacherRepo.create({
        name,
        email: email.toLowerCase(),
        phone: '',
        grade: gradeLabel,
        studentCount: studentCount ?? 0,
        schoolId: resolvedSchoolId,
        gradeGroupId: primary.id,
        status: status || 'active',
      });
      if (req.body.password) {
        teacher.password = await hashPassword(req.body.password);
      }
      teacher.gradeGroups = gradeGroups;
      const savedTeacher = await teacherRepo.save(teacher);
      const { password: _pw, signupCode: _sc, phone: _p, ...teacherData } = savedTeacher;

      res.status(201).json({
        success: true,
        data: { ...teacherData, gradeGroupIds: gradeGroups.map((g) => g.id) },
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

      const existing = await teacherRepo.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['gradeGroups'],
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

      const gradeGroupRepo = getGradeGroupRepository();

      // Handle grade groups: gradeGroupIds (array) or gradeGroupId (single)
      const requestedGradeGroupIds = updateData.gradeGroupIds !== undefined
        ? updateData.gradeGroupIds
        : updateData.gradeGroupId !== undefined
          ? (updateData.gradeGroupId ? [updateData.gradeGroupId] : [])
          : undefined;
      if (requestedGradeGroupIds !== undefined) {
        if (requestedGradeGroupIds.length === 0) {
          existing.gradeGroupId = null;
          existing.grade = '';
          existing.gradeGroups = [];
        } else {
          const gradeGroups = await gradeGroupRepo.find({
            where: { id: In(requestedGradeGroupIds), deletedAt: IsNull() },
          });
          if (gradeGroups.length !== requestedGradeGroupIds.length) {
            throw new AppError('One or more grade groups not found', 404);
          }
          existing.gradeGroupId = gradeGroups[0].id;
          existing.grade = gradeGroups[0].label || gradeGroups[0].name || '';
          existing.gradeGroups = gradeGroups;
        }
        delete updateData.gradeGroupIds;
        delete updateData.gradeGroupId;
      }

      if (updateData.classIds !== undefined) delete updateData.classIds;

      // Update teacher
      Object.assign(existing, updateData);
      const updatedTeacher = await teacherRepo.save(existing);
      const withGroups = await teacherRepo.findOne({
        where: { id: updatedTeacher.id },
        relations: ['gradeGroups'],
      });
      const { password: _pw2, signupCode: _sc2, phone: _p2, gradeGroups: _gg2, ...updatedData } = updatedTeacher;
      const gradeGroupIds = (withGroups?.gradeGroups ?? []).length > 0
        ? withGroups!.gradeGroups!.map((g) => g.id)
        : updatedTeacher.gradeGroupId
          ? [updatedTeacher.gradeGroupId]
          : [];

      res.json({
        success: true,
        data: { ...updatedData, gradeGroupIds },
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
