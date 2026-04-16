const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'LabTrack API',
    version: '1.0.0',
    description: 'Complete API documentation for LabTrack backend.'
  },
  servers: [
    {
      url: 'http://localhost:4000/api',
      description: 'Local development server'
    }
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Assets' },
    { name: 'Complaints' },
    { name: 'Admin' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'student'] }
        }
      },
      SignupRequest: {
        type: 'object',
        required: ['name', 'email', 'password', 'role'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'student'] }
        }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              role: { type: 'string' }
            }
          }
        }
      },
      ComplaintStatusUpdate: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'resolved'] }
        }
      },
      ComplaintCreateRequest: {
        type: 'object',
        required: ['assetId', 'description'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          image: { type: 'string', format: 'binary' }
        }
      }
    }
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service status',
            content: {
              'application/json': {
                example: { ok: true, service: 'LabTrack API' }
              }
            }
          }
        }
      }
    },
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Create user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignupRequest' }
            }
          }
        },
        responses: {
          201: { description: 'Account created' },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and receive JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Authenticated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          403: { description: 'Role mismatch', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/assets/landing-snapshot': {
      get: {
        tags: ['Assets'],
        summary: 'Public landing page snapshot',
        responses: {
          200: { description: 'Landing snapshot data' }
        }
      }
    },
    '/assets/labs': {
      get: {
        tags: ['Assets'],
        summary: 'Get grouped lab overview',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Grouped labs and status counts' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/assets/{lab}': {
      get: {
        tags: ['Assets'],
        summary: 'Get assets in a specific lab',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'lab',
            required: true,
            schema: { type: 'string' }
          },
          {
            in: 'query',
            name: 'q',
            required: false,
            schema: { type: 'string' },
            description: 'Optional search by system_id or original_id'
          }
        ],
        responses: {
          200: { description: 'Assets list' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/assets/detail/{systemId}': {
      get: {
        tags: ['Assets'],
        summary: 'Get asset details, history, and complaints',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'systemId',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: { description: 'Asset detail payload' },
          404: { description: 'Asset not found' }
        }
      }
    },
    '/complaints/public-overdue': {
      get: {
        tags: ['Complaints'],
        summary: 'Get public overdue complaints',
        parameters: [
          { in: 'query', name: 'days', schema: { type: 'integer', minimum: 1, maximum: 30 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 20 } }
        ],
        responses: {
          200: { description: 'Overdue complaints list' }
        }
      }
    },
    '/complaints': {
      get: {
        tags: ['Complaints'],
        summary: 'Get complaints (students see own only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Complaints list' },
          401: { description: 'Unauthorized' }
        }
      },
      post: {
        tags: ['Complaints'],
        summary: 'Create complaint with optional image upload',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/ComplaintCreateRequest' }
            }
          }
        },
        responses: {
          201: { description: 'Complaint created' },
          400: { description: 'Bad request' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/complaints/notifications': {
      get: {
        tags: ['Complaints'],
        summary: 'Get user notifications (student/admin filtered)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Notifications list' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/complaints/{id}/plus': {
      post: {
        tags: ['Complaints'],
        summary: 'Support an existing complaint (+1)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        responses: {
          200: { description: 'Support added' },
          400: { description: 'Invalid support action' },
          401: { description: 'Unauthorized' },
          404: { description: 'Complaint not found' }
        }
      }
    },
    '/admin/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Get admin dashboard analytics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Dashboard metrics' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/admin/kanban': {
      get: {
        tags: ['Admin'],
        summary: 'Get complaints for kanban board',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Kanban cards' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/admin/kanban/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Update complaint status from kanban board',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ComplaintStatusUpdate' }
            }
          }
        },
        responses: {
          200: { description: 'Complaint status updated' },
          400: { description: 'Invalid status transition' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/admin/notifications': {
      get: {
        tags: ['Admin'],
        summary: 'Get admin notifications',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Admin notifications' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/admin/import': {
      post: {
        tags: ['Admin'],
        summary: 'Import assets via CSV or Excel file',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Import summary' },
          400: { description: 'File required or invalid data' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/admin/export': {
      get: {
        tags: ['Admin'],
        summary: 'Export inventory/complaint report as CSV, Excel, or PDF',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'format', schema: { type: 'string', enum: ['csv', 'excel', 'pdf'] } },
          { in: 'query', name: 'dataType', schema: { type: 'string', enum: ['inventory', 'complaints', 'both'] } },
          { in: 'query', name: 'category', schema: { type: 'string' } },
          { in: 'query', name: 'lab', schema: { type: 'string' } },
          { in: 'query', name: 'section', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
          { in: 'query', name: 'assetStatus', schema: { type: 'string' } },
          { in: 'query', name: 'priority', schema: { type: 'string' } },
          { in: 'query', name: 'search', schema: { type: 'string' } },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: { description: 'Report file stream' },
          400: { description: 'Invalid export params' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    }
  }
};

export default openApiDocument;
