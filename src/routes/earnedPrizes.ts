import { Router } from 'express';
import { getEarnedPrizeRepository } from '../lib/repositories';
import { emitSchoolPrizeDelivered } from '../socket/emitter';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { markPrizeDeliveredSchema } from '../validations/prize';
import { IsNull } from 'typeorm';

export const earnedPrizeRoutes = Router();

// Get all earned prizes
earnedPrizeRoutes.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { schoolId, classId, delivered, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const earnedPrizeRepo = getEarnedPrizeRepository();

    let where: any = {
      deletedAt: IsNull(),
    };

    // School admins and teachers see their school's earned prizes
    if (req.user?.role === 'school_admin' || req.user?.role === 'teacher') {
      where.schoolId = req.user.schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }

    if (classId) {
      where.classId = classId;
    }

    if (delivered !== undefined) {
      where.delivered = delivered === 'true';
    }

    const [earnedPrizes, total] = await Promise.all([
      earnedPrizeRepo.find({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        relations: ['prize', 'class'],
        order: { earnedAt: 'DESC' },
      }),
      earnedPrizeRepo.count({ where }),
    ]);

    const formatted = earnedPrizes.map((ep) => ({
      id: ep.id,
      prizeId: ep.prizeId,
      classId: ep.classId,
      className: ep.class.name,
      schoolId: ep.schoolId,
      earnedAt: ep.earnedAt.toISOString().split('T')[0],
      delivered: ep.delivered,
    }));

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
      relations: ['prize', 'class'],
    });

    if (!earnedPrize) {
      throw new AppError('Earned prize not found', 404);
    }

    if (req.user?.role === 'school_admin' && req.user.schoolId !== earnedPrize.schoolId) {
      throw new AppError('Forbidden - Access denied', 403);
    }

    const formatted = {
      id: earnedPrize.id,
      prizeId: earnedPrize.prizeId,
      classId: earnedPrize.classId,
      className: earnedPrize.class.name,
      schoolId: earnedPrize.schoolId,
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
      });

      if (!earnedPrize) {
        throw new AppError('Earned prize not found', 404);
      }

      // School admins can only update their school's earned prizes
      if (req.user?.role === 'school_admin' && req.user.schoolId !== earnedPrize.schoolId) {
        throw new AppError('Forbidden - Access denied', 403);
      }

      earnedPrize.delivered = delivered;
      const updated = await earnedPrizeRepo.save(earnedPrize);

      const updatedWithRelations = await earnedPrizeRepo.findOne({
        where: { id },
        relations: ['prize', 'class'],
      });

      const formatted = {
        id: updated.id,
        prizeId: updated.prizeId,
        classId: updated.classId,
        className: updatedWithRelations?.class.name || '',
        schoolId: updated.schoolId,
        earnedAt: updated.earnedAt.toISOString().split('T')[0],
        delivered: updated.delivered,
      };

      emitSchoolPrizeDelivered({
        schoolId: updated.schoolId,
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
