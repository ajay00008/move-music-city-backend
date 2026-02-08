import { Router } from 'express';
import { getUserRepository, getTeacherRepository, getSchoolRepository, getClassRepository, getClassTeacherRepository } from '../lib/repositories';
import { AppError } from '../middleware/errorHandler';
import { hashPassword, comparePassword, generateToken } from '../lib/utils';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  teacherLoginSchema,
  teacherSignupSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '../validations/auth';
import { IsNull } from 'typeorm';

export const authRoutes = Router();

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map<string, { otp: string; expiresAt: Date }>();
const resetTokenStore = new Map<string, { email: string; expiresAt: Date }>();

// Login
authRoutes.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userRepo = getUserRepository();

    const user = await userRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    if (user.status === 'inactive') {
      throw new AppError('Account is inactive', 401);
    }

    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    });

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
});

// Forgot Password - Send OTP
authRoutes.post('/forgot-password', validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const userRepo = getUserRepository();

    const user = await userRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });

    // Don't reveal if user exists for security
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, an OTP has been sent',
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    otpStore.set(email.toLowerCase(), { otp, expiresAt });

    // Send OTP email
    try {
      const { sendOtpEmail } = await import('../lib/email');
      await sendOtpEmail(email, otp);
    } catch (error) {
      // Log error but don't fail the request (for development)
      console.error('Failed to send email:', error);
      console.log(`⚠️  OTP for ${email}: ${otp} (email sending failed, check console)`);
    }

    res.json({
      success: true,
      message: 'OTP sent to your email',
    });
  } catch (error) {
    next(error);
  }
});

// Verify OTP
authRoutes.post('/verify-otp', validate(verifyOtpSchema), async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const stored = otpStore.get(email.toLowerCase());

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired OTP', 400);
    }

    if (stored.otp !== otp) {
      throw new AppError('Invalid OTP', 400);
    }

    // Generate reset token
    const resetToken = generateToken({ email: email.toLowerCase() } as any);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    resetTokenStore.set(resetToken, { email: email.toLowerCase(), expiresAt });
    otpStore.delete(email.toLowerCase());

    res.json({
      success: true,
      resetToken,
    });
  } catch (error) {
    next(error);
  }
});

// Reset Password
authRoutes.post('/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    const stored = resetTokenStore.get(resetToken);

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const userRepo = getUserRepository();
    const user = await userRepo.findOne({
      where: { email: stored.email, deletedAt: IsNull() },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    await userRepo.save(user);

    resetTokenStore.delete(resetToken);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Teacher Signup (app only: name, email, password, phone → creates teacher with no school; school assigns by 4-digit code)
authRoutes.post('/teacher/signup', validate(teacherSignupSchema), async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    const teacherRepo = getTeacherRepository();

    const existing = await teacherRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });
    if (existing) {
      throw new AppError('A teacher with this email already exists', 400);
    }

    let signupCode: string | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const taken = await teacherRepo.findOne({
        where: { signupCode: code, deletedAt: IsNull() },
      });
      if (!taken) {
        signupCode = code;
        break;
      }
      if (attempt === 19) {
        throw new AppError('Could not generate a unique code. Please try again.', 500);
      }
    }
    if (!signupCode) {
      throw new AppError('Could not generate a unique code. Please try again.', 500);
    }

    const teacher = teacherRepo.create({
      name,
      email: email.toLowerCase(),
      password: await hashPassword(password),
      phone: phone || '',
      grade: '',
      studentCount: 0,
      schoolId: null,
      signupCode,
      status: 'active',
    });
    const saved = await teacherRepo.save(teacher);

    res.status(201).json({
      success: true,
      teacher: { id: saved.id, code: saved.signupCode },
      message: 'Please provide this code to your school so they can assign you to classes.',
    });
  } catch (error) {
    next(error);
  }
});

// Teacher Login
authRoutes.post('/teacher/login', validate(teacherLoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const teacherRepo = getTeacherRepository();
    const schoolRepo = getSchoolRepository();
    const classRepo = getClassRepository();
    const classTeacherRepo = getClassTeacherRepository();

    const teacher = await teacherRepo.findOne({
      where: { email: email.toLowerCase(), deletedAt: IsNull() },
    });

    if (!teacher) {
      throw new AppError('Invalid email or password', 401);
    }

    if (teacher.status === 'inactive') {
      throw new AppError('Account is inactive', 401);
    }

    if (!teacher.password) {
      throw new AppError('Password not set. Please ask your school admin to set your password.', 401);
    }

    const isValidPassword = await comparePassword(password, teacher.password);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    // Not assigned to a school: do not log in; return code so they can give it to the school
    if (teacher.schoolId == null) {
      return res.status(200).json({
        notAssigned: true,
        code: teacher.signupCode || '',
        message: 'Give this code to your school so they can assign you. You can log in after you are assigned.',
      });
    }

    const token = generateToken({
      id: teacher.id,
      email: teacher.email,
      role: 'teacher',
      schoolId: teacher.schoolId,
    });

    const school = await schoolRepo.findOne({
      where: { id: teacher.schoolId },
    });

    const classTeachers = await classTeacherRepo.find({
      where: { teacherId: teacher.id },
    });
    const classIds = classTeachers.map((ct) => ct.classId);
    const classes = classIds.length
      ? await classRepo.find({
          where: classIds.map((id) => ({ id, deletedAt: IsNull() })),
        })
      : [];

    res.json({
      success: true,
      token,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        grade: teacher.grade,
        studentCount: teacher.studentCount,
        schoolId: teacher.schoolId,
        classIds,
      },
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        section: c.section,
        studentCount: c.studentCount,
        fitnessMinutes: c.fitnessMinutes,
      })),
      school: school ? { id: school.id, name: school.name } : { id: teacher.schoolId, name: '' },
    });
  } catch (error) {
    next(error);
  }
});

// Logout (client-side token removal, server just acknowledges)
authRoutes.post('/logout', async (req, res) => {
  // Logout is primarily client-side (removing token from localStorage)
  // Server just acknowledges the request
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});
