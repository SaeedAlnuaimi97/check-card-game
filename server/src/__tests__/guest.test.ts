import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ============================================================
// Guest Profile API route tests
// ============================================================
// Tests the GET /api/guest/:guestId endpoint using mocked
// GuestProfileModel and lightweight req/res objects.

const { mockFindOne } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
}));

vi.mock('../models/GuestProfile', () => ({
  GuestProfileModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

// Import router after mocks are set up
import guestRouter from '../routes/guest';

// ============================================================
// Helper: extract route handler from Express router
// ============================================================

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: Request, res: Response) => Promise<void> }[];
  };
}

function getHandler(method: string, path: string) {
  const layers = (guestRouter as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of layers) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}

// ============================================================
// Helper: create mock req/res
// ============================================================

function createMockReqRes(params: Record<string, string> = {}) {
  const req = { params, query: {} } as unknown as Request;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

// ============================================================
// GET /guest/:guestId tests
// ============================================================

describe('GET /guest/:guestId', () => {
  const handler = getHandler('get', '/guest/:guestId');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns username for a known guestId', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ guestId: 'guest_abc123', username: 'Alice' }),
    });

    const { req, res } = createMockReqRes({ guestId: 'guest_abc123' });
    await handler(req, res);

    expect(mockFindOne).toHaveBeenCalledWith({ guestId: 'guest_abc123' });
    expect(res.json).toHaveBeenCalledWith({
      guestId: 'guest_abc123',
      username: 'Alice',
    });
  });

  it('returns 404 when guestId is not found', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve(null),
    });

    const { req, res } = createMockReqRes({ guestId: 'guest_unknown' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Guest not found' });
  });

  it('returns 500 on database error', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.reject(new Error('DB connection failed')),
    });

    const { req, res } = createMockReqRes({ guestId: 'guest_abc123' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('queries with the exact guestId from params', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ guestId: 'guest_special_chars_123', username: 'Bob' }),
    });

    const { req, res } = createMockReqRes({ guestId: 'guest_special_chars_123' });
    await handler(req, res);

    expect(mockFindOne).toHaveBeenCalledWith({ guestId: 'guest_special_chars_123' });
    expect(res.json).toHaveBeenCalledWith({
      guestId: 'guest_special_chars_123',
      username: 'Bob',
    });
  });
});
