import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

type Match = {
  key: string;
  reqSummary?: (req: Request) => string;
  resSummary?: (body: any) => string;
};

const ENABLED =
  process.env.TEACHER_API_LOGGING === '1' ||
  process.env.TEACHER_API_LOGGING === 'true' ||
  process.env.TEACHER_API_LOGGING === 'yes';

const matches: Array<{ test: (req: Request) => boolean; match: Match }> = [
  {
    test: (req) => req.path === '/auth/teacher/login',
    match: {
      key: 'teacher-login',
      reqSummary: (req) => {
        // Do not log passwords/tokens.
        const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
        return email ? `email=${email}` : '';
      },
      resSummary: (body) => {
        const success = body?.success;
        const teacherId = body?.teacher?.id;
        const gradeGroupsCount = Array.isArray(body?.gradeGroups) ? body.gradeGroups.length : undefined;
        const notAssigned = !!body?.notAssigned;
        return notAssigned
          ? 'notAssigned=true'
          : `success=${success} teacherId=${teacherId ?? 'n/a'} gradeGroups=${gradeGroupsCount ?? 0}`;
      },
    },
  },
  {
    test: (req) => req.path.startsWith('/grade-groups/list'),
    match: {
      key: 'grade-groups-list',
      reqSummary: (req) => {
        const schoolId = typeof req.query?.schoolId === 'string' ? req.query.schoolId : undefined;
        return schoolId ? `schoolId=${schoolId}` : '';
      },
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `gradeGroups=${count}`;
      },
    },
  },
  {
    test: (req) => req.path.startsWith('/prizes'),
    match: {
      key: 'prizes',
      reqSummary: (req) => {
        const gradeGroupId =
          typeof req.query?.gradeGroupId === 'string' ? req.query.gradeGroupId : undefined;
        const limit = typeof req.query?.limit === 'string' ? req.query.limit : undefined;
        return `gradeGroupId=${gradeGroupId ?? 'n/a'} limit=${limit ?? 'n/a'}`;
      },
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `prizesCount=${count}`;
      },
    },
  },
  {
    test: (req) => req.path.startsWith('/earned-prizes'),
    match: {
      key: 'earned-prizes',
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `earnedPrizesCount=${count}`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me/progress',
    match: {
      key: 'teacher-progress',
      resSummary: (body) => {
        const d = body?.data;
        const fitnessMinutes = typeof d?.fitnessMinutes === 'number' ? d.fitnessMinutes : undefined;
        const earnedPrizesCount = typeof d?.earnedPrizesCount === 'number' ? d.earnedPrizesCount : undefined;
        return `fitnessMinutes=${fitnessMinutes ?? 0} earned=${earnedPrizesCount ?? 0}`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me/add-minutes',
    match: {
      key: 'teacher-add-minutes',
      reqSummary: (req) => {
        const minutes = typeof req.body?.minutes === 'number' ? req.body.minutes : undefined;
        return minutes != null ? `minutes=${minutes}` : '';
      },
      resSummary: (body) => {
        const d = body?.data;
        const fitnessMinutes = typeof d?.fitnessMinutes === 'number' ? d.fitnessMinutes : undefined;
        const earnedPrizesCount = typeof d?.earnedPrizesCount === 'number' ? d.earnedPrizesCount : undefined;
        const newEarnedPrizes = typeof body?.newEarnedPrizes === 'number' ? body.newEarnedPrizes : undefined;
        return `fitnessMinutes=${fitnessMinutes ?? 0} earned=${earnedPrizesCount ?? 0} newEarnedPrizes=${newEarnedPrizes ?? 0}`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me/leaderboard',
    match: {
      key: 'teacher-leaderboard',
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `leaderboardSize=${count}`;
      },
    },
  },
];

export function teacherApiLogger(req: Request, res: Response, next: NextFunction) {
  if (!ENABLED) return next();

  const match = matches.find((m) => m.test(req))?.match;
  if (!match) return next();

  const reqIdHeader = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined;
  const reqId = reqIdHeader ?? crypto.randomBytes(6).toString('hex');

  const start = Date.now();
  let responseSummary = '';

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    try {
      responseSummary = match.resSummary ? match.resSummary(body) : '';
      // Log only error-like responses succinctly.
      if (!responseSummary && body?.success === false) {
        const errMsg = body?.error || body?.message;
        responseSummary = errMsg ? `error=${errMsg}` : 'success=false';
      }
    } catch {
      // Never break the request because logging failed.
    }
    return originalJson(body);
  }) as any;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const reqSummary = match.reqSummary ? match.reqSummary(req) : '';

    // Keep output short and stable. Example:
    // [TeacherAPI][a1b2c3] GET /prizes?... gradeGroupId=... -> 200 prizesCount=2 (34ms)
    const shortPath = req.originalUrl || req.url;
    const safeReqSummary = reqSummary ? ` ${reqSummary}` : '';
    const safeResSummary = responseSummary ? ` ${responseSummary}` : '';
    console.log(
      `[TeacherAPI][${reqId}] ${req.method} ${shortPath}${safeReqSummary} -> ${status}${safeResSummary} (${ms}ms)`
    );
  });

  // Pass request id downstream if other middleware wants it.
  res.setHeader?.('x-request-id', reqId);

  next();
}

