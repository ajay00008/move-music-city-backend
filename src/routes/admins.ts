import { Router } from 'express';
import { getUserRepository, getSchoolRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAdminSchema, updateAdminSchema } from '../validations/admin';
import { hashPassword } from '../lib/utils';
import { IsNull, ILike, Not } from 'typeorm';
import { UserRole } from '../entities/User';

export const adminRoutes = Router();

// Get all admins
adminRoutes.get('/', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { search, status, schoolId, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const userRepo = getUserRepository();

    let where: any = {
      role: UserRole.SCHOOL_ADMIN,
      deletedAt: IsNull(),
    };

    if (status) {
      where.status = status;
    }

    if (schoolId) {
      where.schoolId = schoolId;
    }

    if (search) {
      where = [
        { ...where, name: ILike(`%${search}%`) },
        { ...where, email: ILike(`%${search}%`) },
      ];
    }

    const [admins, total] = await Promise.all([
      userRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        relations: ['school'],
        order: { createdAt: 'DESC' },
        select: ['id', 'email', 'name', 'role', 'schoolId', 'status', 'createdAt', 'updatedAt'],
      }),
      userRepo.count({ where }),
    ]);

    const formattedAdmins = admins.map((admin) => ({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      schoolId: admin.schoolId,
      status: admin.status,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      school: admin.school
        ? {
            id: admin.school.id,
            name: admin.school.name,
          }
        : null,
    }));

    res.json({
      data: formattedAdmins,
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

// Get admin by ID
adminRoutes.get('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRepo = getUserRepository();

    const admin = await userRepo.findOne({
      where: {
        id,
        role: UserRole.SCHOOL_ADMIN,
        deletedAt: IsNull(),
      },
      relations: ['school'],
      select: ['id', 'email', 'name', 'role', 'schoolId', 'status', 'createdAt', 'updatedAt'],
    });

    if (!admin) {
      throw new AppError('Admin not found', 404);
    }

    res.json({
      data: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        schoolId: admin.schoolId,
        status: admin.status,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
        school: admin.school
          ? {
              id: admin.school.id,
              name: admin.school.name,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create admin
adminRoutes.post(
  '/',
  authenticate,
  requireSuperAdmin,
  validate(createAdminSchema),
  async (req, res, next) => {
    try {
      const { name, email, password, schoolId, status } = req.body;
      const userRepo = getUserRepository();
      const schoolRepo = getSchoolRepository();

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
      const existing = await userRepo.findOne({
        where: { email: email.toLowerCase(), deletedAt: IsNull() },
      });

      if (existing) {
        throw new AppError('User with this email already exists', 400);
      }

      const hashedPassword = await hashPassword(password);

      const admin = userRepo.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: UserRole.SCHOOL_ADMIN,
        schoolId,
        status: status || 'active',
      });

      const saved = await userRepo.save(admin);

      res.status(201).json({
        success: true,
        data: {
          id: saved.id,
          email: saved.email,
          name: saved.name,
          role: saved.role,
          schoolId: saved.schoolId,
          status: saved.status,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update admin
adminRoutes.put(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(updateAdminSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData: any = { ...req.body };
      const userRepo = getUserRepository();
      const schoolRepo = getSchoolRepository();

      // Get existing admin
      const existing = await userRepo.findOne({
        where: {
          id,
          role: UserRole.SCHOOL_ADMIN,
          deletedAt: IsNull(),
        },
      });

      if (!existing) {
        throw new AppError('Admin not found', 404);
      }

      // Verify school if being updated
      if (updateData.schoolId) {
        const school = await schoolRepo.findOne({
          where: {
            id: updateData.schoolId,
            deletedAt: IsNull(),
          },
        });

        if (!school) {
          throw new AppError('School not found', 404);
        }
      }

      // Handle email uniqueness
      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase();
        const emailExists = await userRepo.findOne({
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

      Object.assign(existing, updateData);
      const updated = await userRepo.save(existing);

      res.json({
        success: true,
        data: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          schoolId: updated.schoolId,
          status: updated.status,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete admin (soft delete)
adminRoutes.delete('/:id', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRepo = getUserRepository();

    const admin = await userRepo.findOne({ where: { id } });
    if (!admin) {
      throw new AppError('Admin not found', 404);
    }

    admin.deletedAt = new Date();
    await userRepo.save(admin);

    res.json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});
