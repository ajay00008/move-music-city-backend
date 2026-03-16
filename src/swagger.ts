const bearerAuth = {
  type: 'http' as const,
  scheme: 'bearer' as const,
  bearerFormat: 'JWT',
  description: 'JWT token from login or teacher/login',
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'School Hub API',
    description: 'Backend API for School Hub - schools, teachers, admins, grade groups, prizes, and dashboard.',
    version: '1.0.0',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      bearerAuth,
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    // --- Auth ---
    '/auth/login': {
      post: {
        summary: 'Admin login (super_admin / school_admin)',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    token: { type: 'string' },
                    user: { type: 'object', description: 'User without password' },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials or inactive account', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request password reset OTP',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP sent (or generic message if email not found)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/verify-otp': {
      post: {
        summary: 'Verify OTP and get reset token',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  otp: { type: 'string', pattern: '^[0-9]{4,6}$' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP valid, returns resetToken',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    resetToken: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid or expired OTP', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Reset password using reset token',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['resetToken', 'newPassword'],
                properties: {
                  resetToken: { type: 'string' },
                  newPassword: { type: 'string', minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password reset successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid or expired reset token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/teacher/signup': {
      post: {
        summary: 'Teacher self-signup',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'gradeGroupId'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  schoolId: { type: 'string', format: 'uuid', nullable: true },
                  gradeGroupId: { type: 'string', format: 'uuid' },
                  studentCount: { type: 'integer', minimum: 0, default: 0 },
                  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Teacher account created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    teacher: { type: 'object', properties: { id: { type: 'string' } } },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Email already exists or validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/teacher/login': {
      post: {
        summary: 'Teacher login',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful (or notAssigned if teacher has no school)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    notAssigned: { type: 'boolean', description: 'True if teacher not assigned to a school' },
                    message: { type: 'string' },
                    token: { type: 'string' },
                    teacher: { type: 'object' },
                    gradeGroups: { type: 'array' },
                    school: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials or inactive', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Logout (client removes token; server acknowledges)',
        tags: ['Auth'],
        responses: {
          '200': {
            description: 'Logged out',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // --- Schools ---
    '/schools/list': {
      get: {
        summary: 'List school names and IDs (public, for signup dropdown)',
        tags: ['Schools'],
        responses: {
          '200': {
            description: 'List of { id, name } for active schools',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } } },
                },
              },
            },
          },
        },
      },
    },
    '/schools': {
      get: {
        summary: 'Get all schools (paginated)',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or email' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Schools with teacherCount, admins, pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create school (super_admin only)',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'address', 'phone', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  address: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'School and school admin created' },
          '400': { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schools/{id}': {
      get: {
        summary: 'Get school by ID',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'School with teacherCount and admins' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Update school (super_admin only)',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  address: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'School updated' },
          '400': { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete school and related data (super_admin only, soft delete)',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'School deleted' },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schools/{schoolId}/teachers': {
      get: {
        summary: 'Get teachers by school',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'schoolId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'List of teachers (no password/signupCode)' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schools/{schoolId}/earned-prizes': {
      get: {
        summary: 'Get earned prizes by school',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'schoolId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'delivered', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': { description: 'List of earned prizes with class/teacher info' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schools/{schoolId}/earned-prizes/pending-count': {
      get: {
        summary: 'Get count of undelivered earned prizes for school',
        tags: ['Schools'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'schoolId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Pending count',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { count: { type: 'integer' } } },
              },
            },
          },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // --- Teachers ---
    '/teachers': {
      get: {
        summary: 'Get all teachers (paginated)',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'schoolId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Teachers with gradeGroupIds and pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create teacher (school_admin)',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  grade: { type: 'string', default: '' },
                  studentCount: { type: 'integer', minimum: 0, default: 0 },
                  schoolId: { type: 'string', format: 'uuid' },
                  gradeGroupId: { type: 'string', format: 'uuid' },
                  gradeGroupIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  classIds: { type: 'array', items: { type: 'string' } },
                  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                  password: { type: 'string', minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Teacher created' },
          '400': { description: 'Validation or duplicate email', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School or grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/teachers/me/progress': {
      get: {
        summary: 'Get current teacher fitness progress (teacher only)',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'fitnessMinutes, earnedPrizesCount, currentSegmentMinutes, minutesForNextPrize',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        fitnessMinutes: { type: 'integer' },
                        earnedPrizesCount: { type: 'integer' },
                        currentSegmentMinutes: { type: 'integer' },
                        minutesForNextPrize: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Teachers only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/teachers/me/add-minutes': {
      post: {
        summary: 'Add fitness minutes for current teacher (teacher only)',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['minutes'],
                properties: { minutes: { type: 'integer', minimum: 1 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated progress and newEarnedPrizes count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' },
                    newEarnedPrizes: { type: 'integer' },
                  },
                },
              },
            },
          },
          '403': { description: 'Teachers only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Teacher or grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/teachers/me/leaderboard': {
      get: {
        summary: 'Leaderboard for teachers in same grade groups (teacher only)',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of { id, name, grade, fitnessMinutes, earnedPrizesCount }',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          grade: { type: 'string' },
                          fitnessMinutes: { type: 'integer' },
                          earnedPrizesCount: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Teachers only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/teachers/{id}': {
      get: {
        summary: 'Get teacher by ID',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Teacher with gradeGroupIds' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Update teacher',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  grade: { type: 'string' },
                  studentCount: { type: 'integer', minimum: 0 },
                  schoolId: { type: 'string', format: 'uuid', nullable: true },
                  gradeGroupId: { type: 'string', format: 'uuid', nullable: true },
                  gradeGroupIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                  password: { type: 'string', minLength: 6, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Teacher updated' },
          '400': { description: 'Validation or email in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Teacher or grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete teacher (soft delete). Self or school admin for own school.',
        tags: ['Teachers'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Teacher deleted' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // --- Admins ---
    '/admins': {
      get: {
        summary: 'Get all school admins (super_admin only)',
        tags: ['Admins'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
          { name: 'schoolId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Admins with school info and pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        summary: 'Create school admin (super_admin only)',
        tags: ['Admins'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'schoolId'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  schoolId: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Admin created' },
          '400': { description: 'Email already in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admins/{id}': {
      get: {
        summary: 'Get admin by ID (super_admin only)',
        tags: ['Admins'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Admin with school' },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Admin not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Update admin (super_admin only)',
        tags: ['Admins'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  schoolId: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Admin updated' },
          '400': { description: 'Email in use', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Admin or school not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete admin (super_admin only, soft delete)',
        tags: ['Admins'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Admin deleted' },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Admin not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // --- Grade Groups ---
    '/grade-groups/list': {
      get: {
        summary: 'List grade groups (public, for signup). Optional ?schoolId for global + school.',
        tags: ['Grade Groups'],
        parameters: [{ name: 'schoolId', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'List of { id, name, label }',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, label: { type: 'string' } } } } },
                },
              },
            },
          },
        },
      },
    },
    '/grade-groups': {
      get: {
        summary: 'Get all grade groups (auth). School admin sees global + own school.',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Grade groups with classIds',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'array' } },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create grade group (super_admin only)',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'label'],
                properties: {
                  name: { type: 'string' },
                  label: { type: 'string' },
                  schoolId: { type: 'string', format: 'uuid', nullable: true },
                  grades: { type: 'string' }, // or array, comma-separated
                  classIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Grade group created' },
          '400': { description: 'Invalid class IDs', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'School not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/grade-groups/{id}': {
      get: {
        summary: 'Get grade group by ID',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Grade group with classIds' },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Update grade group',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  label: { type: 'string' },
                  schoolId: { type: 'string', format: 'uuid', nullable: true },
                  grades: { type: 'string', nullable: true },
                  classIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Grade group updated' },
          '400': { description: 'Invalid class IDs', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete grade group and associated prizes (soft delete)',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Grade group deleted' },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/grade-groups/{gradeGroupId}/prizes': {
      get: {
        summary: 'Get prizes by grade group',
        tags: ['Grade Groups'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'gradeGroupId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'List of prizes for this grade group' },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // --- Prizes ---
    '/prizes': {
      get: {
        summary: 'Get all prizes (paginated, filtered by role)',
        tags: ['Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'gradeGroupId', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Prizes with pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create prize (super_admin only)',
        tags: ['Prizes'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'description', 'minutesRequired', 'icon', 'gradeGroupId'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  minutesRequired: { type: 'integer', minimum: 0 },
                  icon: { type: 'string' },
                  gradeGroupId: { type: 'string' },
                  schoolId: { type: 'string', format: 'uuid', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Prize created' },
          '403': { description: 'Super admin only', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/prizes/{id}': {
      get: {
        summary: 'Get prize by ID',
        tags: ['Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Prize' },
          '404': { description: 'Prize not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Update prize',
        tags: ['Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  minutesRequired: { type: 'integer', minimum: 0 },
                  icon: { type: 'string' },
                  gradeGroupId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Prize updated' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Prize or grade group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete prize (soft delete)',
        tags: ['Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Prize deleted' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Prize not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // --- Earned Prizes ---
    '/earned-prizes': {
      get: {
        summary: 'Get all earned prizes (paginated)',
        tags: ['Earned Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'schoolId', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'delivered', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Earned prizes with class/teacher info and pagination',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array' },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/earned-prizes/{id}': {
      get: {
        summary: 'Get earned prize by ID',
        tags: ['Earned Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Earned prize with class/teacher' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Earned prize not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        summary: 'Mark prize as delivered/undelivered',
        tags: ['Earned Prizes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['delivered'],
                properties: { delivered: { type: 'boolean' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Earned prize updated' },
          '403': { description: 'Access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Earned prize not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/dashboard/stats': {
      get: {
        summary: 'Dashboard statistics (role-based)',
        tags: ['Dashboard'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Super admin: totalSchools, activeSchools, totalAdmins, totalTeachers. School admin: totalTeachers, activeTeachers.' },
          '500': { description: 'Invalid role or missing school ID', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};
