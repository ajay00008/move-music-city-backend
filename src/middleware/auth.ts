import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { getUserRepository, getTeacherRepository } from '../lib/repositories';
import { IsNull } from 'typeorm';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'super_admin' | 'school_admin' | 'teacher';
    schoolId?: string | null;
    /** Teacher's display name (for primaryTeacherName when returning their class) */
    name?: string | null;
    /** Set when role is teacher; used to filter prizes by grade group */
    teacherGrade?: string | null;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Unauthorized - No token provided', 401);
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: 'super_admin' | 'school_admin' | 'teacher';
      schoolId?: string | null;
    };

    if (decoded.role === 'teacher') {
      const teacherRepo = getTeacherRepository();
      const teacher = await teacherRepo.findOne({
        where: { id: decoded.id, deletedAt: IsNull() },
      });
      if (!teacher || teacher.status === 'inactive') {
        throw new AppError('Unauthorized - Teacher not found or inactive', 401);
      }
      req.user = {
        id: teacher.id,
        email: teacher.email,
        role: 'teacher',
        schoolId: teacher.schoolId,
        name: teacher.name ?? null,
        teacherGrade: teacher.grade ?? null,
      };
      return next();
    }

    // Verify user still exists and is active
    const userRepo = getUserRepository();
    const user = await userRepo.findOne({
      where: {
        id: decoded.id,
        deletedAt: IsNull(),
      },
    });

    if (!user || user.status === 'inactive') {
      throw new AppError('Unauthorized - User not found or inactive', 401);
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Unauthorized - Invalid token', 401));
    }
    next(error);
  }
};

export const requireRole = (...roles: ('super_admin' | 'school_admin' | 'teacher')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden - Insufficient permissions', 403));
    }

    next();
  };
};

export const requireSuperAdmin = requireRole('super_admin');

export const requireSchoolAdmin = requireRole('school_admin');
