/**
 * Console filter for production mode
 * Suppresses verbose logs when not in development
 */

const isDev = process.env.NODE_ENV === 'development';
const debugEnabled = process.env.CLIOBRAIN_DEBUG === '1' || process.env.DEBUG === '1';

if (!isDev && !debugEnabled) {
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[verbose]')) return;
    originalLog.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('Electron')) return;
    originalWarn.apply(console, args);
  };
}
