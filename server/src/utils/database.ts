import mongoose from 'mongoose';
import { logger } from './logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 10 : 3000;

function isCosmosDB(uri: string): boolean {
  return uri.includes('.cosmos.') || uri.includes('cosmos.azure.com');
}

function getConnectionOptions(uri: string): mongoose.ConnectOptions {
  const baseOptions: mongoose.ConnectOptions = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  if (isCosmosDB(uri)) {
    return {
      ...baseOptions,
      retryWrites: false, // Cosmos DB does not support retryable writes
    };
  }

  return baseOptions;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/check-card-game';
  const options = getConnectionOptions(uri);
  const dbType = isCosmosDB(uri) ? 'Cosmos DB' : 'MongoDB';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, options);
      logger.info({ dbType, attempt }, 'Database connected');
      break;
    } catch (error) {
      logger.error({ err: error, attempt, maxRetries: MAX_RETRIES }, 'Database connection failed');
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      const delay = RETRY_DELAY_MS * attempt;
      logger.info({ delay }, 'Retrying database connection...');
      await sleep(delay);
    }
  }

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'Database connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Database disconnected');
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Database connection closed');
}

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received, closing database...');
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
