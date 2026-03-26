import { Router } from 'express';
import { getSchoolRepository, getTeacherRepository, getEarnedPrizeRepository, getUserRepository, getGradeGroupRepository, getPrizeRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createSchoolSchema, updateSchoolSchema } from '../validations/school';
import { IsNull, Not, ILike } from 'typeorm';
import { hashPassword } from '../lib/utils';
import { UserRole, Status as UserStatus } from '../entities/User';
import { Status as SchoolStatus } from '../entities/School';

export const schoolRoutes = Router();

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

// Public: list school names and ids (for teacher signup dropdown)
schoolRoutes.get('/list', async (req, res, next) => {
  try {
    const schoolRepo = getSchoolRepository();
    const schools = await schoolRepo.find({
      where: { deletedAt: IsNull(), status: SchoolStatus.ACTIVE },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    res.json({ data: schools });
  } catch (error) {
    next(error);
  }
});

// Get all schools
schoolRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { search, status, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const schoolRepo = getSchoolRepository();

    let where: any = {
      deletedAt: IsNull(),
    };

    // School admins can only see their own school
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.id = req.user.schoolId;
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

    const [schools, total] = await Promise.all([
      schoolRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        order: { createdAt: 'DESC' },
        relations: ['admins'],
      }),
      schoolRepo.count({ where }),
    ]);

    const teacherRepo = getTeacherRepository();
    const userRepo = getUserRepository();

    const schoolsWithCounts = await Promise.all(
      schools.map(async (school) => {
        const [teacherCount, schoolAdmins] = await Promise.all([
          teacherRepo.count({ where: { schoolId: school.id, deletedAt: IsNull() } }),
          (school.admins?.length
            ? Promise.resolve(school.admins.filter((a: any) => !a.deletedAt))
            : userRepo.find({
                where: { schoolId: school.id, role: UserRole.SCHOOL_ADMIN, deletedAt: IsNull() },
                select: ['id', 'name', 'email'],
              })),
        ]);
        const adminsList = schoolAdmins.map((a: any) => ({
          id: a.id,
          name: a.name,
          email: a.email,
        }));
        const primary = adminsList[0];

        return {
          ...school,
          teacherCount,
          adminId: primary?.id ?? null,
          adminEmail: primary?.email ?? school.email ?? null,
          admins: adminsList,
        };
      })
    );

    res.json({
      data: schoolsWithCounts,
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

// Get school by ID
schoolRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const schoolRepo = getSchoolRepository();

    // School admins can only see their own school
    if (req.user?.role === 'school_admin' && req.user.schoolId !== id) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const school = await schoolRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['admins'],
    });

    if (!school) {
      throw new AppError('School not found', 404);
    }

    const teacherRepo = getTeacherRepository();
    const userRepo = getUserRepository();
    const [teacherCount, schoolAdmins] = await Promise.all([
      teacherRepo.count({ where: { schoolId: school.id, deletedAt: IsNull() } }),
      school.admins?.length
        ? Promise.resolve(school.admins.filter((a: any) => !a.deletedAt))
        : userRepo.find({
            where: { schoolId: school.id, role: UserRole.SCHOOL_ADMIN, deletedAt: IsNull() },
            select: ['id', 'name', 'email'],
          }),
    ]);
    const adminsList = schoolAdmins.map((a: any) => ({
      id: a.id,
      name: a.name,
      email: a.email,
    }));
    const primary = adminsList[0];

    res.json({
      data: {
        ...school,
        teacherCount,
        adminId: primary?.id ?? null,
        adminEmail: primary?.email ?? school.email ?? null,
        admins: adminsList,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create school
schoolRoutes.post(
  '/',
  authenticate,
  requireSuperAdmin,
  validate(createSchoolSchema),
  async (req, res, next) => {
    try {
      const { name, address, phone, email, password, status } = req.body;
      const schoolRepo = getSchoolRepository();
      const userRepo = getUserRepository();

      // Check if school email already exists
      const existingSchool = await schoolRepo.findOne({
        where: { email: email.toLowerCase(), deletedAt: IsNull() },
      });

      if (existingSchool) {
        throw new AppError('School with this email already exists', 400);
      }

      // Check if user with this email already exists
      const existingUser = await userRepo.findOne({
        where: { email: email.toLowerCase(), deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new AppError('User with this email already exists', 400);
      }

      // Create school
      const school = schoolRepo.create({
        name,
        address,
        phone,
        email: email.toLowerCase(),
        status: status || 'active',
      });

      const savedSchool = await schoolRepo.save(school);

      // Create school admin with school email and password
      const hashedPassword = await hashPassword(password);
      const admin = userRepo.create({
        name: name, // Use school name as admin name
        email: email.toLowerCase(),
        password: hashedPassword,
        role: UserRole.SCHOOL_ADMIN,
        schoolId: savedSchool.id,
        status: UserStatus.ACTIVE,
      });

      const createdAdmin = await userRepo.save(admin);

      res.status(201).json({
        success: true,
        data: {
          ...savedSchool,
          teacherCount: 0,
        },
        message: 'School created successfully. You can login with the school email and password.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update school
schoolRoutes.put(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(updateSchoolSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData: any = { ...req.body };
      const schoolRepo = getSchoolRepository();
      const userRepo = getUserRepository();

      const school = await schoolRepo.findOne({ where: { id } });
      if (!school) {
        throw new AppError('School not found', 404);
      }

      // Store old email to update admin user if email changes
      const oldEmail = school.email;
      const emailChanged = updateData.email && updateData.email.toLowerCase() !== oldEmail.toLowerCase();

      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase();
        // Check if email is already taken by another school
        const existingSchool = await schoolRepo.findOne({
          where: {
            email: updateData.email,
            id: Not(id),
            deletedAt: IsNull(),
          },
        });

        if (existingSchool) {
          throw new AppError('Email already in use by another school', 400);
        }

        // Check if email is already taken by another user
        const existingUser = await userRepo.findOne({
          where: {
            email: updateData.email,
            deletedAt: IsNull(),
          },
        });

        if (existingUser && existingUser.schoolId !== id) {
          throw new AppError('Email already in use by another user', 400);
        }
      }

      Object.assign(school, updateData);
      const updatedSchool = await schoolRepo.save(school);

      // If email changed, update the school admin user's email
      if (emailChanged) {
        const schoolAdmin = await userRepo.findOne({
          where: {
            schoolId: id,
            role: UserRole.SCHOOL_ADMIN,
            email: oldEmail.toLowerCase(),
            deletedAt: IsNull(),
          },
        });

        if (schoolAdmin) {
          schoolAdmin.email = updateData.email;
          await userRepo.save(schoolAdmin);
        }
      }

      const teacherRepo = getTeacherRepository();
      const teacherCount = await teacherRepo.count({ where: { schoolId: updatedSchool.id, deletedAt: IsNull() } });

      res.json({
        success: true,
        data: {
          ...updatedSchool,
          teacherCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete school (soft delete) and all related data
schoolRoutes.delete('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolRepo = getSchoolRepository();
    const userRepo = getUserRepository();
    const teacherRepo = getTeacherRepository();
    const gradeGroupRepo = getGradeGroupRepository();
    const prizeRepo = getPrizeRepository();
    const earnedPrizeRepo = getEarnedPrizeRepository();

    const school = await schoolRepo.findOne({ where: { id } });
    if (!school) {
      throw new AppError('School not found', 404);
    }

    const now = new Date();

    await Promise.all([
      earnedPrizeRepo.update({ schoolId: id }, { deletedAt: now }),
      prizeRepo.update({ schoolId: id }, { deletedAt: now }),
      gradeGroupRepo.update({ schoolId: id }, { deletedAt: now }),
      teacherRepo.update({ schoolId: id }, { deletedAt: now }),
      userRepo.update({ schoolId: id }, { deletedAt: now }),
    ]);

    school.deletedAt = now;
    await schoolRepo.save(school);

    res.json({
      success: true,
      message: 'School and all related data deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get teachers by school
schoolRoutes.get('/:schoolId/teachers', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId } = req.params;

    if (req.user?.role === 'school_admin' && req.user.schoolId !== schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const teacherRepo = getTeacherRepository();
    const teachers = await teacherRepo.find({
      where: { schoolId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    const formattedTeachers = teachers.map((t) => {
      const { password: _p, signupCode: _s, ...rest } = t;
      return rest;
    });

    res.json({ data: formattedTeachers });
  } catch (error) {
    next(error);
  }
});

// Get earned prizes by school
schoolRoutes.get('/:schoolId/earned-prizes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId } = req.params;
    const { delivered } = req.query;

    // Validate access
    if (req.user?.role === 'school_admin' && req.user.schoolId !== schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const earnedPrizeRepo = getEarnedPrizeRepository();

    let where: any = {
      schoolId,
      deletedAt: IsNull(),
    };

    if (delivered !== undefined) {
      where.delivered = delivered === 'true';
    }

    const earnedPrizes = await earnedPrizeRepo.find({
      where,
      relations: ['prize', 'prize.gradeGroup', 'teacher', 'class', 'class.teachers', 'class.teachers.teacher'],
      order: { earnedAt: 'DESC' },
    });
    const teacherRepo = getTeacherRepository();
    const teachers = await teacherRepo.find({
      where: { schoolId, deletedAt: IsNull() },
      relations: ['gradeGroups'],
      select: ['id', 'name', 'schoolId', 'gradeGroupId'],
    });
    const teacherIndex = buildTeacherNameIndex(teachers as TeacherForLookup[]);

    const formatted = earnedPrizes.map((ep) => {
      const schoolIdForRow = ep.schoolId ?? ep.class?.schoolId ?? schoolId;
      return {
        id: ep.id,
        prizeId: ep.prizeId,
        classId: ep.classId,
        className: ep.class?.name ?? '—',
        gradeGroupId: ep.prize?.gradeGroupId ?? null,
        gradeGroupName: ep.prize?.gradeGroup?.label || ep.prize?.gradeGroup?.name || '—',
        teacherName: resolveTeacherName(schoolIdForRow, ep.prize?.gradeGroupId, ep.teacher?.name, ep.class, teacherIndex),
        studentCount: ep.class?.studentCount ?? ep.teacher?.studentCount ?? 0,
        schoolId: schoolIdForRow,
        earnedAt: ep.earnedAt.toISOString().split('T')[0],
        delivered: ep.delivered,
      };
    });

    res.json({ data: formatted });
  } catch (error) {
    next(error);
  }
});

// Get pending prizes count
schoolRoutes.get('/:schoolId/earned-prizes/pending-count', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId } = req.params;

    // Validate access
    if (req.user?.role === 'school_admin' && req.user.schoolId !== schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const earnedPrizeRepo = getEarnedPrizeRepository();

    const count = await earnedPrizeRepo.count({
      where: {
        schoolId,
        delivered: false,
        deletedAt: IsNull(),
      },
    });

    res.json({ count });
  } catch (error) {
    next(error);
  }
});
