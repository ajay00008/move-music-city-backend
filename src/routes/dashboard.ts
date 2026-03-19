import { Router } from 'express';
import { getUserRepository, getSchoolRepository, getTeacherRepository } from '../lib/repositories';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { IsNull } from 'typeorm';
import { UserRole, Status } from '../entities/User';

export const dashboardRoutes = Router();

// Get dashboard statistics (classes removed; teachers only)
dashboardRoutes.get('/stats', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userRepo = getUserRepository();
    const schoolRepo = getSchoolRepository();
    const teacherRepo = getTeacherRepository();

    if (req.user?.role === 'super_admin') {
      const [totalSchools, activeSchools, totalAdmins, totalTeachers] = await Promise.all([
        schoolRepo.count({ where: { deletedAt: IsNull() } }),
        schoolRepo.count({ where: { deletedAt: IsNull(), status: Status.ACTIVE } }),
        userRepo.count({ where: { role: UserRole.SCHOOL_ADMIN, deletedAt: IsNull() } }),
        teacherRepo.count({ where: { deletedAt: IsNull() } }),
      ]);

      res.json({
        totalSchools,
        activeSchools,
        totalAdmins,
        totalTeachers,
      });
    } else if (req.user?.role === 'school_admin' && req.user.schoolId) {
      const [totalTeachers, activeTeachers] = await Promise.all([
        teacherRepo.count({
          where: { schoolId: req.user.schoolId, deletedAt: IsNull() },
        }),
        teacherRepo.count({
          where: {
            schoolId: req.user.schoolId,
            deletedAt: IsNull(),
            status: Status.ACTIVE,
          },
        }),
      ]);

      res.json({
        totalTeachers,
        activeTeachers,
      });
    } else {
      throw new AppError('Invalid user role or missing school ID', 403);
    }
  } catch (error) {
    next(error);
  }
});
