import { Router } from 'express';
import { getUserRepository, getSchoolRepository, getTeacherRepository, getClassRepository } from '../lib/repositories';
import { authenticate, AuthRequest } from '../middleware/auth';
import { IsNull } from 'typeorm';
import { UserRole, Status } from '../entities/User';

export const dashboardRoutes = Router();

// Get dashboard statistics
dashboardRoutes.get('/stats', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userRepo = getUserRepository();
    const schoolRepo = getSchoolRepository();
    const teacherRepo = getTeacherRepository();
    const classRepo = getClassRepository();

    if (req.user?.role === 'super_admin') {
      // Super admin dashboard stats
      const [totalSchools, activeSchools, totalAdmins, totalTeachers, totalClasses] = await Promise.all([
        schoolRepo.count({ where: { deletedAt: IsNull() } }),
        schoolRepo.count({ where: { deletedAt: IsNull(), status: Status.ACTIVE } }),
        userRepo.count({ where: { role: UserRole.SCHOOL_ADMIN, deletedAt: IsNull() } }),
        teacherRepo.count({ where: { deletedAt: IsNull() } }),
        classRepo.count({ where: { deletedAt: IsNull() } }),
      ]);

      res.json({
        totalSchools,
        activeSchools,
        totalAdmins,
        totalTeachers,
        totalClasses,
      });
    } else if (req.user?.role === 'school_admin' && req.user.schoolId) {
      // School admin dashboard stats
      const [totalTeachers, activeTeachers, totalClasses, classes] = await Promise.all([
        teacherRepo.count({
          where: {
            schoolId: req.user.schoolId,
            deletedAt: IsNull(),
          },
        }),
        teacherRepo.count({
          where: {
            schoolId: req.user.schoolId,
            deletedAt: IsNull(),
            status: Status.ACTIVE,
          },
        }),
        classRepo.count({
          where: {
            schoolId: req.user.schoolId,
            deletedAt: IsNull(),
          },
        }),
        classRepo.find({
          where: {
            schoolId: req.user.schoolId,
            deletedAt: IsNull(),
          },
          select: ['studentCount'],
        }),
      ]);

      const totalStudents = classes.reduce((sum, cls) => sum + cls.studentCount, 0);

      res.json({
        totalTeachers,
        activeTeachers,
        totalClasses,
        totalStudents,
      });
    } else {
      throw new Error('Invalid user role or missing school ID');
    }
  } catch (error) {
    next(error);
  }
});
