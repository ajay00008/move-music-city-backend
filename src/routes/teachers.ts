import { Router } from 'express';
import { getTeacherRepository, getSchoolRepository, getClassTeacherRepository, getClassRepository, getGradeGroupRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureSchoolAdminSchool } from '../middleware/validateSchoolAccess';
import { validate } from '../middleware/validate';
import { createTeacherSchema, updateTeacherSchema } from '../validations/teacher';
import { hashPassword } from '../lib/utils';
import { IsNull, ILike, Not } from 'typeorm';

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

    const classTeacherRepo = getClassTeacherRepository();
    const formattedTeachers = await Promise.all(
      teachers.map(async (teacher) => {
        const classTeachers = await classTeacherRepo.find({
          where: { teacherId: teacher.id },
        });
        const { password: _pw, signupCode: _sc, phone: _p, ...rest } = teacher;
        return { ...rest, classIds: classTeachers.map((ct) => ct.classId) };
      })
    );

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

// Get teacher by ID
teacherRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const teacherRepo = getTeacherRepository();
    const classTeacherRepo = getClassTeacherRepository();

    const teacher = await teacherRepo.findOne({
      where: {
        id,
        deletedAt: IsNull(),
      },
    });

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    // Teachers can only fetch their own record (e.g. to refresh class assignments)
    if (req.user?.role === 'teacher' && req.user.id !== id) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    // School admins can see their school's teachers or unassigned teachers (to fetch by ID and assign)
    if (
      req.user?.role === 'school_admin' &&
      teacher.schoolId != null &&
      req.user.schoolId !== teacher.schoolId
    ) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const classTeachers = await classTeacherRepo.find({
      where: { teacherId: teacher.id },
    });
    const { password: _pw, signupCode: _sc, phone: _p, ...rest } = teacher;

    res.json({
      data: { ...rest, classIds: classTeachers.map((ct) => ct.classId) },
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
      const classTeacherRepo = getClassTeacherRepository();
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

      const classTeachers = await classTeacherRepo.find({
        where: { teacherId: savedTeacher.id },
      });
      const { password: _pw, signupCode: _sc, phone: _p, ...teacherData } = savedTeacher;

      res.status(201).json({
        success: true,
        data: { ...teacherData, classIds: classTeachers.map((ct) => ct.classId) },
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
      const classTeacherRepo = getClassTeacherRepository();
      const classRepo = getClassRepository();

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

      // Clear class relationships when using grade-group flow (no classIds sent)
      if (updateData.classIds !== undefined && Array.isArray(updateData.classIds) && updateData.classIds.length === 0) {
        await classTeacherRepo.delete({ teacherId: id });
        delete updateData.classIds;
      } else if (updateData.classIds !== undefined) {
        delete updateData.classIds;
      }

      // Update teacher
      Object.assign(existing, updateData);
      const updatedTeacher = await teacherRepo.save(existing);

      const classTeachers = await classTeacherRepo.find({
        where: { teacherId: updatedTeacher.id },
      });
      const { password: _pw2, signupCode: _sc2, phone: _p2, ...updatedData } = updatedTeacher;

      res.json({
        success: true,
        data: { ...updatedData, classIds: classTeachers.map((ct) => ct.classId) },
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
