import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateToken = (payload: {
  id: string;
  email: string;
  role: 'super_admin' | 'school_admin' | 'teacher';
  schoolId?: string | null;
}): string => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

export const paginate = <T>(
  data: T[],
  page: number = 1,
  limit: number = 10
) => {
  const offset = (page - 1) * limit;
  const paginatedData = data.slice(offset, offset + limit);
  const total = data.length;
  const totalPages = Math.ceil(total / limit);

  return {
    data: paginatedData,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};
