// src/main/util/log.ts
import log from 'electron-log/main';
import path from 'node:path';
import { app } from 'electron';

export function initLogger(): void {
  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
  log.transports.console.level = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');
  log.info('logger initialized');
}

export const logger = log;
