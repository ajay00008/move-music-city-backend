import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getTeacherRepository, getUserRepository, getClassTeacherRepository } from '../lib/repositories';
import { IsNull } from 'typeorm';
import { classRoom, schoolRoom } from './types';

const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export interface SocketUser {
  id: string;
  email: string;
  role: 'super_admin' | 'school_admin' | 'teacher';
  schoolId?: string | null;
}

export type IoServer = Server;

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io = new Server(httpServer, {
    cors: {
      origin: FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean),
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.query?.token as string);

      if (!token || !JWT_SECRET) {
        return next(new Error('Unauthorized'));
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
          return next(new Error('Unauthorized'));
        }
        const classTeacherRepo = getClassTeacherRepository();
        const links = await classTeacherRepo.find({
          where: { teacherId: teacher.id },
          select: ['classId'],
        });
        const classIds = links.map((l) => l.classId);

        (socket as Socket & { data: { user: SocketUser; classIds: string[] } }).data = {
          user: {
            id: teacher.id,
            email: teacher.email,
            role: 'teacher',
            schoolId: teacher.schoolId,
          },
          classIds,
        };

        for (const classId of classIds) {
          await socket.join(classRoom(classId));
        }
        if (teacher.schoolId) {
          await socket.join(schoolRoom(teacher.schoolId));
        }
        return next();
      }

      const userRepo = getUserRepository();
      const user = await userRepo.findOne({
        where: { id: decoded.id, deletedAt: IsNull() },
      });
      if (!user || user.status === 'inactive') {
        return next(new Error('Unauthorized'));
      }

      (socket as Socket & { data: { user: SocketUser; classIds: string[] } }).data = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
        },
        classIds: [],
      };

      if (user.schoolId) {
        await socket.join(schoolRoom(user.schoolId));
      }
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = (socket as Socket & { data: { user: SocketUser } }).data;
    console.log(`[Socket] ${data?.user?.role} connected: ${data?.user?.id}`);
    socket.on('disconnect', () => {
      console.log(`[Socket] ${data?.user?.role} disconnected: ${data?.user?.id}`);
    });
  });

  return io;
}
