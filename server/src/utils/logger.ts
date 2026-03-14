import pino from 'pino';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'),
  transport: IS_PRODUCTION
    ? undefined // JSON output in production (machine-readable)
    : {
        target: 'pino/file', // plain output in dev
        options: { destination: 1 }, // stdout
      },
  ...(IS_PRODUCTION
    ? {}
    : {
        formatters: {
          level(label) {
            return { level: label };
          },
        },
      }),
});
