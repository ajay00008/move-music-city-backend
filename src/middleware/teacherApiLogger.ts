import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type Match = {
  key: string;
  reqSummary?: (req: Request) => string;
  resSummary?: (body: any) => string;
};

/** Console lines (optional). */
const CONSOLE_ENABLED =
  process.env.TEACHER_API_LOGGING === '1' ||
  process.env.TEACHER_API_LOGGING === 'true' ||
  process.env.TEACHER_API_LOGGING === 'yes';

/**
 * File logging for diagnosing recurring teacher/admin issues without app code.
 * Default ON. Disable with API_FILE_LOGGING=0|false|no
 */
const FILE_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.API_FILE_LOGGING ?? '1').toLowerCase()
);

const LOG_ROOT = process.env.API_LOG_DIR
  ? path.resolve(process.env.API_LOG_DIR)
  : path.join(process.cwd(), 'logs', 'api');

const SENSITIVE_KEYS = new Set([
  'password',
  'oldpassword',
  'newpassword',
  'token',
  'resettoken',
  'authorization',
  'jwt',
  'secret',
]);

function ensureLogDirs() {
  try {
    fs.mkdirSync(path.join(LOG_ROOT, 'users'), { recursive: true });
  } catch {
    // ignore
  }
}

if (FILE_ENABLED) {
  ensureLogDirs();
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => redact(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function safeJson(value: unknown, maxLen = 2000): string {
  try {
    const s = JSON.stringify(redact(value));
    if (!s) return '';
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch {
    return '';
  }
}

function sanitizeFilePart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._@-]+/g, '_')
    .slice(0, 120);
}

/** Decode JWT payload for logging only (no signature verification). */
function identityFromAuthHeader(req: Request): {
  id?: string;
  email?: string;
  role?: string;
  schoolId?: string | null;
} {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return {};
    const token = auth.slice(7);
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8'
    );
    const payload = JSON.parse(json);
    return {
      id: typeof payload.id === 'string' ? payload.id : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      schoolId: payload.schoolId ?? null,
    };
  } catch {
    return {};
  }
}

function appendLine(filePath: string, line: string) {
  try {
    fs.appendFileSync(filePath, line + '\n', { encoding: 'utf8' });
  } catch {
    // Never break requests because logging failed.
  }
}

function writeFileLogs(opts: {
  when: string;
  reqId: string;
  method: string;
  pathOnly: string;
  query: unknown;
  body: unknown;
  identity: { id?: string; email?: string; role?: string; schoolId?: string | null };
  status: number;
  ms: number;
  key: string;
  reqSummary: string;
  resSummary: string;
  errorHint?: string;
}) {
  if (!FILE_ENABLED) return;
  ensureLogDirs();

  const userLabel =
    opts.identity.email ||
    opts.identity.id ||
    (typeof (opts.body as any)?.email === 'string' ? (opts.body as any).email : null) ||
    'anonymous';

  const line = [
    opts.when,
    `req=${opts.reqId}`,
    `user=${userLabel}`,
    opts.identity.id ? `userId=${opts.identity.id}` : null,
    opts.identity.role ? `role=${opts.identity.role}` : null,
    opts.identity.schoolId ? `schoolId=${opts.identity.schoolId}` : null,
    `${opts.method} ${opts.pathOnly}`,
    `key=${opts.key}`,
    opts.reqSummary ? `reqSummary=${opts.reqSummary}` : null,
    `query=${safeJson(opts.query, 800) || '{}'}`,
    `body=${safeJson(opts.body, 1200) || '{}'}`,
    `status=${opts.status}`,
    opts.resSummary ? `resSummary=${opts.resSummary}` : null,
    opts.errorHint ? `error=${opts.errorHint}` : null,
    `ms=${opts.ms}`,
  ]
    .filter(Boolean)
    .join(' | ');

  const day = opts.when.slice(0, 10);
  appendLine(path.join(LOG_ROOT, `${day}.log`), line);
  appendLine(path.join(LOG_ROOT, 'users', `${sanitizeFilePart(String(userLabel))}.log`), line);

  // Extra spotlight file for failures / empty-prize style outcomes.
  if (opts.status >= 400 || /prizesCount=0|earnedPrizesCount=0|error=/i.test(opts.resSummary + (opts.errorHint || ''))) {
    appendLine(path.join(LOG_ROOT, `${day}-alerts.log`), line);
  }
}

const matches: Array<{ test: (req: Request) => boolean; match: Match }> = [
  {
    test: (req) => req.path === '/auth/teacher/login',
    match: {
      key: 'teacher-login',
      reqSummary: (req) => {
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
    test: (req) => req.path === '/auth/teacher/signup',
    match: {
      key: 'teacher-signup',
      reqSummary: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
        const gradeGroupId =
          typeof req.body?.gradeGroupId === 'string' ? req.body.gradeGroupId : undefined;
        return `email=${email ?? 'n/a'} gradeGroupId=${gradeGroupId ?? 'n/a'}`;
      },
      resSummary: (body) =>
        `success=${body?.success} revived=${!!body?.revived} teacherId=${body?.teacher?.id ?? 'n/a'}`,
    },
  },
  {
    test: (req) => req.path.startsWith('/grade-groups'),
    match: {
      key: 'grade-groups',
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
      reqSummary: (req) => {
        const delivered =
          typeof req.query?.delivered === 'string' ? req.query.delivered : undefined;
        const schoolId = typeof req.query?.schoolId === 'string' ? req.query.schoolId : undefined;
        return `delivered=${delivered ?? 'n/a'} schoolId=${schoolId ?? 'n/a'}`;
      },
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `earnedPrizesCount=${count}`;
      },
    },
  },
  {
    test: (req) => /\/schools\/[^/]+\/earned-prizes/.test(req.path),
    match: {
      key: 'school-earned-prizes',
      reqSummary: (req) => {
        const delivered =
          typeof req.query?.delivered === 'string' ? req.query.delivered : undefined;
        return `delivered=${delivered ?? 'n/a'} path=${req.path}`;
      },
      resSummary: (body) => {
        if (typeof body?.count === 'number') return `pendingCount=${body.count}`;
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `earnedPrizesCount=${count}`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me' || req.path === '/teachers/me/profile',
    match: {
      key: 'teacher-me',
      resSummary: (body) => {
        const d = body?.data ?? body;
        return `teacherId=${d?.id ?? 'n/a'} gradeGroupId=${d?.gradeGroupId ?? 'n/a'} gradeGroupIds=${
          Array.isArray(d?.gradeGroupIds) ? d.gradeGroupIds.length : 0
        } fitnessMinutes=${d?.fitnessMinutes ?? 'n/a'} earned=${d?.earnedPrizesCount ?? 'n/a'}`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me/progress',
    match: {
      key: 'teacher-progress',
      resSummary: (body) => {
        const d = body?.data;
        return `fitnessMinutes=${d?.fitnessMinutes ?? 0} earned=${d?.earnedPrizesCount ?? 0}`;
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
        return `fitnessMinutes=${d?.fitnessMinutes ?? 0} earned=${d?.earnedPrizesCount ?? 0} newEarnedPrizes=${
          body?.newEarnedPrizes ?? 0
        }`;
      },
    },
  },
  {
    test: (req) => req.path === '/teachers/me/reset-progress',
    match: {
      key: 'teacher-reset-progress',
      resSummary: (body) => {
        const d = body?.data;
        return `msg=${body?.message ?? ''} fitnessMinutes=${d?.fitnessMinutes ?? 0} earned=${
          d?.earnedPrizesCount ?? 0
        }`;
      },
    },
  },
  {
    test: (req) => /\/teachers\/[^/]+\/reset-account$/.test(req.path),
    match: {
      key: 'teacher-reset-account',
      reqSummary: (req) =>
        `resetProgress=${!!req.body?.resetProgress} gradeGroupId=${req.body?.gradeGroupId ?? 'n/a'}`,
      resSummary: (body) =>
        `success=${body?.success} teacherId=${body?.data?.id ?? 'n/a'} gradeGroupIds=${
          Array.isArray(body?.data?.gradeGroupIds) ? body.data.gradeGroupIds.length : 0
        }`,
    },
  },
  {
    test: (req) => req.path === '/teachers/me/leaderboard' || req.path === '/teachers/leaderboard',
    match: {
      key: 'teacher-leaderboard',
      resSummary: (body) => {
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        return `leaderboardSize=${count}`;
      },
    },
  },
  {
    test: (req) =>
      (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') &&
      req.path.startsWith('/teachers'),
    match: {
      key: 'teachers-mutate',
      reqSummary: (req) => `path=${req.path}`,
      resSummary: (body) =>
        `success=${body?.success ?? 'n/a'} id=${body?.data?.id ?? 'n/a'} revived=${!!body?.revived}`,
    },
  },
];

export function teacherApiLogger(req: Request, res: Response, next: NextFunction) {
  if (!CONSOLE_ENABLED && !FILE_ENABLED) return next();

  const pathOnly = (req.originalUrl || req.url || '')
    .toString()
    .split('?')[0]
    .split('#')[0];

  const reqForMatch: any = {
    path: pathOnly,
    originalUrl: req.originalUrl,
    url: req.url,
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers,
  };

  const match = matches.find((m) => m.test(reqForMatch as Request))?.match;
  if (!match) return next();

  const reqIdHeader =
    typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined;
  const reqId = reqIdHeader ?? crypto.randomBytes(6).toString('hex');
  const identity = identityFromAuthHeader(req);
  const start = Date.now();
  let responseSummary = '';
  let errorHint = '';

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    try {
      responseSummary = match.resSummary ? match.resSummary(body) : '';
      if (!responseSummary && body?.success === false) {
        const errMsg = body?.error || body?.message;
        responseSummary = errMsg ? `error=${errMsg}` : 'success=false';
      }
      if (body?.success === false) {
        errorHint = String(body?.error || body?.message || 'success=false');
      }
    } catch {
      // ignore
    }
    return originalJson(body);
  }) as any;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const reqSummary = match.reqSummary ? match.reqSummary(reqForMatch as Request) : '';
    const when = new Date().toISOString();

    if (CONSOLE_ENABLED) {
      const safeReqSummary = reqSummary ? ` ${reqSummary}` : '';
      const safeResSummary = responseSummary ? ` ${responseSummary}` : '';
      const who = identity.email || identity.id || '';
      console.log(
        `[TeacherAPI][${reqId}]${who ? `[${who}]` : ''} ${req.method} ${pathOnly}${safeReqSummary} -> ${status}${safeResSummary} (${ms}ms)`
      );
    }

    writeFileLogs({
      when,
      reqId,
      method: req.method,
      pathOnly,
      query: req.query,
      body: req.body,
      identity,
      status,
      ms,
      key: match.key,
      reqSummary,
      resSummary: responseSummary,
      errorHint: errorHint || (status >= 400 ? `http_${status}` : undefined),
    });
  });

  res.setHeader?.('x-request-id', reqId);
  next();
}
