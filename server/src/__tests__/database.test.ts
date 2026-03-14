import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Database utility tests (F-250)
// ============================================================

// Mock mongoose
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockConnectionOn = vi.fn();

vi.mock('mongoose', () => ({
  default: {
    connect: (...args: unknown[]) => mockConnect(...args),
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
    connection: {
      on: (...args: unknown[]) => mockConnectionOn(...args),
    },
  },
}));

// Suppress logger output during tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { connectDB, disconnectDB, registerShutdownHandlers } from '../utils/database';

describe('database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    delete process.env.MONGODB_URI;
  });

  afterEach(() => {
    delete process.env.MONGODB_URI;
  });

  // ============================================================
  // connectDB
  // ============================================================

  describe('connectDB', () => {
    it('connects to local MongoDB by default', async () => {
      mockConnect.mockResolvedValue(undefined);

      await connectDB();

      expect(mockConnect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/check-card-game',
        expect.objectContaining({
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        }),
      );
    });

    it('uses MONGODB_URI env var when set', async () => {
      process.env.MONGODB_URI = 'mongodb://remote-host:27017/testdb';
      mockConnect.mockResolvedValue(undefined);

      await connectDB();

      expect(mockConnect).toHaveBeenCalledWith(
        'mongodb://remote-host:27017/testdb',
        expect.any(Object),
      );
    });

    it('sets retryWrites: false for Cosmos DB URIs', async () => {
      process.env.MONGODB_URI =
        'mongodb://account:key@account.mongo.cosmos.azure.com:10255/db?ssl=true';
      mockConnect.mockResolvedValue(undefined);

      await connectDB();

      expect(mockConnect).toHaveBeenCalledWith(
        expect.stringContaining('cosmos.azure.com'),
        expect.objectContaining({
          retryWrites: false,
        }),
      );
    });

    it('does not set retryWrites for regular MongoDB URIs', async () => {
      mockConnect.mockResolvedValue(undefined);

      await connectDB();

      const options = mockConnect.mock.calls[0][1];
      expect(options).not.toHaveProperty('retryWrites');
    });

    it('retries on connection failure', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined);

      await connectDB();

      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries exhausted', async () => {
      const error = new Error('Connection refused');
      mockConnect
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      await expect(connectDB()).rejects.toThrow('Connection refused');
      expect(mockConnect).toHaveBeenCalledTimes(3);
    });

    it('registers error and disconnected event handlers', async () => {
      mockConnect.mockResolvedValue(undefined);

      await connectDB();

      expect(mockConnectionOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnectionOn).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });
  });

  // ============================================================
  // disconnectDB
  // ============================================================

  describe('disconnectDB', () => {
    it('calls mongoose.disconnect', async () => {
      mockDisconnect.mockResolvedValue(undefined);

      await disconnectDB();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // ============================================================
  // registerShutdownHandlers
  // ============================================================

  describe('registerShutdownHandlers', () => {
    it('registers SIGTERM and SIGINT handlers', () => {
      const processOnSpy = vi.spyOn(process, 'on');

      registerShutdownHandlers();

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      processOnSpy.mockRestore();
    });
  });
});
