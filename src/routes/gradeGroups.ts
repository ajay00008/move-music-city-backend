import { Router } from 'express';
import { getGradeGroupRepository, getPrizeRepository, getSchoolRepository, getClassRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createGradeGroupSchema, updateGradeGroupSchema } from '../validations/prize';
import { IsNull, Not, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Prize } from '../entities/Prize';
import { GradeGroup } from '../entities/GradeGroup';

export const gradeGroupRoutes = Router();

// Get all grade groups
gradeGroupRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const gradeGroupRepo = getGradeGroupRepository();
    
    let where: any = {
      deletedAt: IsNull(),
    };

    // School admins can only see their school's grade groups
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    } else {
      // For super admin, exclude null schoolIds (migrated data)
      where.schoolId = Not(IsNull());
    }

    const gradeGroups = await gradeGroupRepo.find({
      where,
      order: { createdAt: 'ASC' },
      relations: ['classes'],
    });

    const data = gradeGroups.map((gg) => {
      const { classes: _c, ...rest } = gg;
      return { ...rest, classIds: gg.classes?.map((c) => c.id) ?? [] };
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// Get grade group by ID
gradeGroupRoutes.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const gradeGroupRepo = getGradeGroupRepository();

    let where: any = {
      id,
      deletedAt: IsNull(),
    };

    // School admins can only see their school's grade groups
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    }

    const gradeGroup = await gradeGroupRepo.findOne({
      where,
      relations: ['classes'],
    });

    if (!gradeGroup) {
      throw new AppError('Grade group not found', 404);
    }

    const { classes: _c, ...rest } = gradeGroup;
    const data = { ...rest, classIds: gradeGroup.classes?.map((c) => c.id) ?? [] };

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// Create grade group
gradeGroupRoutes.post(
  '/',
  authenticate,
  validate(createGradeGroupSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { name, label, schoolId, grades, classIds } = req.body;
      const gradeGroupRepo = getGradeGroupRepository();
      const schoolRepo = getSchoolRepository();
      const classRepo = getClassRepository();

      let targetSchoolId = schoolId;
      if (req.user?.role === 'school_admin') {
        targetSchoolId = req.user.schoolId;
      }

      if (!targetSchoolId) {
        throw new AppError('School ID is required', 400);
      }

      const school = await schoolRepo.findOne({
        where: {
          id: targetSchoolId,
          deletedAt: IsNull(),
        },
      });

      if (!school) {
        throw new AppError('School not found', 404);
      }

      let gradesToStore = grades ?? null;
      let classEntities: Awaited<ReturnType<typeof classRepo.find>> = [];

      if (classIds && classIds.length > 0) {
        const classes = await classRepo.find({
          where: { id: In(classIds), schoolId: targetSchoolId, deletedAt: IsNull() },
        });
        if (classes.length !== classIds.length) {
          throw new AppError('One or more class IDs are invalid or do not belong to this school', 400);
        }
        classEntities = classes;
        if (classes.length > 0) {
          const uniqueGrades = [...new Set(classes.map((c) => c.grade).filter(Boolean))];
          gradesToStore = uniqueGrades.length > 0 ? uniqueGrades.join(',') : null;
        }
      }

      const gradeGroup = gradeGroupRepo.create({
        name,
        label,
        schoolId: targetSchoolId,
        grades: gradesToStore,
      });

      const saved = await gradeGroupRepo.save(gradeGroup);

      if (classEntities.length > 0) {
        saved.classes = classEntities;
        await gradeGroupRepo.save(saved);
      }

      const withClasses = await gradeGroupRepo.findOne({
        where: { id: saved.id },
        relations: ['classes'],
      });

      const { classes: _c1, ...savedRest } = withClasses!;
      res.status(201).json({
        success: true,
        data: { ...savedRest, classIds: withClasses!.classes?.map((c) => c.id) ?? [] },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update grade group
gradeGroupRoutes.put(
  '/:id',
  authenticate,
  validate(updateGradeGroupSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      const gradeGroupRepo = getGradeGroupRepository();
      const classRepo = getClassRepository();

      let where: any = { id };
      if (req.user?.role === 'school_admin' && req.user.schoolId) {
        where.schoolId = req.user.schoolId;
      }

      const gradeGroup = await gradeGroupRepo.findOne({ where, relations: ['classes'] });
      if (!gradeGroup) {
        throw new AppError('Grade group not found', 404);
      }

      delete updateData.schoolId;
      const classIds = updateData.classIds;
      delete updateData.classIds;

      if (classIds !== undefined) {
        if (classIds.length > 0) {
          const targetSchoolId = gradeGroup.schoolId;
          if (!targetSchoolId) {
            throw new AppError('Grade group has no school', 400);
          }
          const classes = await classRepo.find({
            where: { id: In(classIds), schoolId: targetSchoolId, deletedAt: IsNull() },
          });
          if (classes.length !== classIds.length) {
            throw new AppError('One or more class IDs are invalid or do not belong to this school', 400);
          }
          gradeGroup.classes = classes;
          const uniqueGrades = [...new Set(classes.map((c) => c.grade).filter(Boolean))];
          gradeGroup.grades = uniqueGrades.length > 0 ? uniqueGrades.join(',') : null;
        } else {
          gradeGroup.classes = [];
          gradeGroup.grades = null;
        }
      } else {
        if (updateData.grades === undefined) {
          delete updateData.grades;
        } else if (updateData.grades === '') {
          updateData.grades = null;
        }
      }

      Object.assign(gradeGroup, updateData);
      const updated = await gradeGroupRepo.save(gradeGroup);

      const withClasses = await gradeGroupRepo.findOne({
        where: { id: updated.id },
        relations: ['classes'],
      });

      const { classes: _c2, ...updatedRest } = withClasses!;
      res.json({
        success: true,
        data: { ...updatedRest, classIds: withClasses!.classes?.map((c) => c.id) ?? [] },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete grade group (soft delete - also deletes associated prizes)
gradeGroupRoutes.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const gradeGroupRepo = getGradeGroupRepository();

    let where: any = { id };
    // School admins can only delete their school's grade groups
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    }

    const gradeGroup = await gradeGroupRepo.findOne({ where });
    if (!gradeGroup) {
      throw new AppError('Grade group not found', 404);
    }

    // Soft delete grade group and associated prizes
    await AppDataSource.transaction(async (manager) => {
      const prizeRepo = manager.getRepository(Prize);
      const gradeGroupRepo = manager.getRepository(GradeGroup);
      
      const prizeWhere = gradeGroup.schoolId != null
        ? { gradeGroupId: id, schoolId: gradeGroup.schoolId }
        : { gradeGroupId: id };
      await prizeRepo.update(prizeWhere, { deletedAt: new Date() });
      
      gradeGroup.deletedAt = new Date();
      await gradeGroupRepo.save(gradeGroup);
    });

    res.json({
      success: true,
      message: 'Grade group deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get prizes by grade group
gradeGroupRoutes.get('/:gradeGroupId/prizes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { gradeGroupId } = req.params;
    const gradeGroupRepo = getGradeGroupRepository();
    const prizeRepo = getPrizeRepository();

    let where: any = {
      id: gradeGroupId,
      deletedAt: IsNull(),
    };

    // School admins can only see their school's grade groups
    if (req.user?.role === 'school_admin' && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    }

    const gradeGroup = await gradeGroupRepo.findOne({ where });

    if (!gradeGroup) {
      throw new AppError('Grade group not found', 404);
    }

    const prizeWhere: any = {
      gradeGroupId,
      schoolId: gradeGroup.schoolId,
      deletedAt: IsNull(),
    };

    const prizes = await prizeRepo.find({
      where: prizeWhere,
      order: { minutesRequired: 'ASC', createdAt: 'ASC' },
    });

    res.json({ data: prizes });
  } catch (error) {
    next(error);
  }
});
