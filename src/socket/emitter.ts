import type { Server as IoServer } from 'socket.io';
import { SOCKET_EVENTS, classRoom, schoolRoom } from './types';
import type {
  ClassMinutesUpdatedPayload,
  SchoolPrizeEarnedPayload,
  SchoolPrizeDeliveredPayload,
  SchoolPrizeCreatedPayload,
  SchoolPrizeUpdatedPayload,
} from './types';

let io: IoServer | null = null;

export function setSocketIo(server: IoServer): void {
  io = server;
}

export function getSocketIo(): IoServer | null {
  return io;
}

export function emitClassMinutesUpdated(payload: ClassMinutesUpdatedPayload): void {
  if (!io) return;
  io.to(classRoom(payload.classId)).emit(SOCKET_EVENTS.CLASS_MINUTES_UPDATED, payload);
  if (payload.schoolId) {
    io.to(schoolRoom(payload.schoolId)).emit(SOCKET_EVENTS.CLASS_MINUTES_UPDATED, payload);
  }
}

export function emitSchoolPrizeEarned(payload: SchoolPrizeEarnedPayload): void {
  if (!io) return;
  io.to(schoolRoom(payload.schoolId)).emit(SOCKET_EVENTS.SCHOOL_PRIZE_EARNED, payload);
}

export function emitSchoolPrizeDelivered(payload: SchoolPrizeDeliveredPayload): void {
  if (!io) return;
  io.to(schoolRoom(payload.schoolId)).emit(SOCKET_EVENTS.SCHOOL_PRIZE_DELIVERED, payload);
}

export function emitSchoolPrizeCreated(payload: SchoolPrizeCreatedPayload): void {
  if (!io) return;
  io.to(schoolRoom(payload.schoolId)).emit(SOCKET_EVENTS.SCHOOL_PRIZE_CREATED, payload);
}

export function emitSchoolPrizeUpdated(payload: SchoolPrizeUpdatedPayload): void {
  if (!io) return;
  io.to(schoolRoom(payload.schoolId)).emit(SOCKET_EVENTS.SCHOOL_PRIZE_UPDATED, payload);
}
