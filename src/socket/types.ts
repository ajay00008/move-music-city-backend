/**
 * Socket.io event types for real-time updates.
 * - class:minutes_updated — when any teacher adds minutes to a class (all co-teachers see it)
 * - school:prize_earned — when a class earns a new prize (school admin is notified to mark deliverable)
 * - school:prize_delivered — when an earned prize is marked delivered
 * - school:prize_created — when a prize is created for a grade/grade group (teachers & admin can refetch)
 * - school:prize_updated — when a prize is updated (teachers refetch prizes)
 */

export const SOCKET_EVENTS = {
  CLASS_MINUTES_UPDATED: 'class:minutes_updated',
  SCHOOL_PRIZE_EARNED: 'school:prize_earned',
  SCHOOL_PRIZE_DELIVERED: 'school:prize_delivered',
  SCHOOL_PRIZE_CREATED: 'school:prize_created',
  SCHOOL_PRIZE_UPDATED: 'school:prize_updated',
} as const;

export type ClassMinutesUpdatedPayload = {
  classId: string;
  schoolId: string;
  fitnessMinutes: number;
  earnedPrizesCount: number;
  newEarnedPrizes: number;
  primaryTeacherName?: string | null;
};

export type SchoolPrizeEarnedPayload = {
  schoolId: string;
  classId: string;
  className: string;
  earnedPrizesCount: number;
  newEarnedPrizes: number;
};

export type SchoolPrizeDeliveredPayload = {
  schoolId: string;
  earnedPrizeId: string;
  delivered: boolean;
};

export type SchoolPrizeCreatedPayload = {
  schoolId: string;
  prizeId: string;
  name: string;
  gradeGroupId: string;
  gradeGroupName: string;
  minutesRequired: number;
  icon: string;
};

export type SchoolPrizeUpdatedPayload = {
  schoolId: string;
  prizeId: string;
  name: string;
  gradeGroupId: string;
  gradeGroupName: string;
  minutesRequired: number;
  icon: string;
};

export function classRoom(classId: string): string {
  return `class:${classId}`;
}

export function schoolRoom(schoolId: string): string {
  return `school:${schoolId}`;
}
