import { Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { AuthRequest } from './auth';

export const validateSchoolAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401));
  }

  // Super admin has access to all schools
  if (req.user.role === 'super_admin') {
    return next();
  }

  // School admin can only access their own school
  const schoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId;

  if (schoolId && req.user.schoolId !== schoolId) {
    return next(new AppError('Forbidden - Access denied to this school', 403));
  }

  // If no schoolId in request, allow (will be filtered by schoolId in queries)
  next();
};

export const ensureSchoolAdminSchool = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401));
  }

  if (req.user.role === 'super_admin') {
    return next();
  }

  // For school admins, ensure they can only access their school's data
  if (!req.user.schoolId) {
    return next(new AppError('Forbidden - No school assigned', 403));
  }

  // Automatically set schoolId for school admins
  if (req.body && !req.body.schoolId) {
    req.body.schoolId = req.user.schoolId;
  }

  next();
};
