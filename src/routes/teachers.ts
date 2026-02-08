import { Router } from 'express';
import { getTeacherRepository, getSchoolRepository, getClassTeacherRepository, getClassRepository } from '../lib/repositories';
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
    const { schoolId, search, status, page = '1', limit = '10' } = req.query;
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

        return {
          ...teacher,
          classIds: classTeachers.map((ct) => ct.classId),
        };
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

// Get teacher by 4-digit signup code (for school admin to fetch app-signup teachers)
teacherRoutes.get('/by-code/:code', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { code } = req.params;
    if (!/^[0-9]{4}$/.test(code)) {
      throw new AppError('Code invalid or already used', 400);
    }
    const teacherRepo = getTeacherRepository();
    const classTeacherRepo = getClassTeacherRepository();

    const teacher = await teacherRepo.findOne({
      where: {
        signupCode: code,
        deletedAt: IsNull(),
      },
    });

    if (!teacher) {
      throw new AppError('Code invalid or already used', 404);
    }

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

    res.json({
      data: {
        ...teacher,
        classIds: classTeachers.map((ct) => ct.classId),
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

    res.json({
      data: {
        ...teacher,
        classIds: classTeachers.map((ct) => ct.classId),
      },
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
      const { name, email, phone, grade: gradeInput, studentCount, schoolId, classIds, status } = req.body;
      const teacherRepo = getTeacherRepository();
      const schoolRepo = getSchoolRepository();
      const classTeacherRepo = getClassTeacherRepository();
      const classRepo = getClassRepository();

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

      // Check if email already exists
      const existing = await teacherRepo.findOne({
        where: {
          email: email.toLowerCase(),
          deletedAt: IsNull(),
        },
      });

      if (existing) {
        throw new AppError('Teacher with this email already exists', 400);
      }

      // Grade comes from first assigned class (grades = classes in this school)
      let grade = gradeInput || '';
      if (!grade && classIds?.length > 0) {
        const firstClass = await classRepo.findOne({
          where: { id: classIds[0], deletedAt: IsNull() },
        });
        if (firstClass) grade = firstClass.grade || '';
      }

      // Create teacher
      const teacher = teacherRepo.create({
        name,
        email: email.toLowerCase(),
        phone,
        grade,
        studentCount: studentCount || 0,
        schoolId,
        status: status || 'active',
      });
      if (req.body.password) {
        teacher.password = await hashPassword(req.body.password);
      }
      const savedTeacher = await teacherRepo.save(teacher);

      // Create class relationships
      if (classIds && classIds.length > 0) {
        const classTeacherRecords = classIds.map((classId: string) =>
          classTeacherRepo.create({
            classId,
            teacherId: savedTeacher.id,
          })
        );
        await classTeacherRepo.save(classTeacherRecords);
      }

      // Fetch with relations for response
      const classTeachers = await classTeacherRepo.find({
        where: { teacherId: savedTeacher.id },
      });

      res.status(201).json({
        success: true,
        data: {
          ...savedTeacher,
          classIds: classTeachers.map((ct) => ct.classId),
        },
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

      // Handle class relationships and derive grade from first assigned class
      if (updateData.classIds !== undefined) {
        // Delete existing relationships
        await classTeacherRepo.delete({ teacherId: id });

        if (updateData.classIds.length > 0) {
          const classTeacherRecords = updateData.classIds.map((classId: string) =>
            classTeacherRepo.create({
              classId,
              teacherId: id,
            })
          );
          await classTeacherRepo.save(classTeacherRecords);
          // Grade = first assigned class's grade (grades = classes in this school)
          if (updateData.grade === undefined || updateData.grade === '') {
            const firstClass = await classRepo.findOne({
              where: { id: updateData.classIds[0], deletedAt: IsNull() },
            });
            if (firstClass) updateData.grade = firstClass.grade || '';
          }
        } else {
          updateData.grade = updateData.grade ?? '';
        }

        delete updateData.classIds;
      }

      // Update teacher
      Object.assign(existing, updateData);
      const updatedTeacher = await teacherRepo.save(existing);

      // Get updated class relationships
      const classTeachers = await classTeacherRepo.find({
        where: { teacherId: updatedTeacher.id },
      });

      res.json({
        success: true,
        data: {
          ...updatedTeacher,
          classIds: classTeachers.map((ct) => ct.classId),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete teacher (soft delete)
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

    // School admins can only delete their school's teachers (not unassigned)
    if (
      req.user?.role === 'school_admin' &&
      (teacher.schoolId == null || req.user.schoolId !== teacher.schoolId)
    ) {
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
