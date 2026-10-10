import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'node:async_hooks';
//import này quan trọng dùng để tạo 1 trace_id cho mỗi request

export interface RequestStore {
  correlationId: string;
  _id?: string;
  role?: string;
}
//hàm này để lưu thông tin user và trace_id mỗi request truy vết được toàn bộ req kể cả đơn luồng dùng asyn/await chục lần
export class RequestContext {
  //hàm này cho bên filter và interseptor dùng setter getter chứ k phải log dùng
  private static readonly asyncLocalStorage =
    new AsyncLocalStorage<RequestStore>();
  //hàm này để lưu thông tin user và trace_id mỗi request
  static run(store: RequestStore, callback: () => void): void {
    this.asyncLocalStorage.run(store, callback);
  }
  //hàm này để lấy thông tin user và trace_id mỗi request
  static getStore(): RequestStore | undefined {
    return this.asyncLocalStorage.getStore();
  }
  static get<K extends keyof RequestStore>(
    key: K,
  ): RequestStore[K] | undefined {
    return this.getStore()?.[key];
  }
  //hàm này để lấy trace_id mỗi request
  static getCorrelationId(): string | undefined {
    return this.getStore()?.correlationId;
  }

  static getUserId(): string | undefined {
    return this.getStore()?._id;
  }
}

// định nghĩa ép kiểu mọi log ỉna phải là string cho dễ làm việc với template string bên dưới khi ghi log ví dụ: obj.string sẽ là [obj obj] k đọc đc j
const safeString = (val: unknown): string => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Error) return val.stack || val.message;
  return JSON.stringify(val);
};

interface LogInfo extends winston.Logform.TransformableInfo {
  service_name?: string;
  trace_id?: string;
  _id?: string;
  timestamp?: string;
  context?: string;
  stack?: string;
}

// 3. Custom Format: Tự động inject trace_id và user_id vào Winston Log Info
// Hàm này lấy traceID từ luồng và từ payload nếu k có mới lấy từ RequestContext
const injectTraceContextFormat = (serviceName: string) =>
  winston.format((info) => {
    let explicitTraceId: string | undefined = undefined;
    let explicitUserId: string | undefined = undefined;

    // 1. Kiểm tra trực tiếp trên info
    const infoRecord = info as Record<string, unknown>;
    if (
      typeof infoRecord.traceId === 'string' &&
      infoRecord.traceId !== 'UNKNOWN'
    ) {
      explicitTraceId = infoRecord.traceId;
    }
    if (
      typeof infoRecord.trace_id === 'string' &&
      infoRecord.trace_id !== 'N/A'
    ) {
      explicitTraceId = explicitTraceId || infoRecord.trace_id;
    }
    if (typeof infoRecord._id === 'string' && infoRecord._id !== 'anonymous') {
      explicitUserId = infoRecord._id;
    }

    // 2. Kiểm tra trong info.message nếu message là object
    if (
      info.message &&
      typeof info.message === 'object' &&
      !Array.isArray(info.message)
    ) {
      const msgObj = info.message as Record<string, unknown>;

      if (typeof msgObj.traceId === 'string' && msgObj.traceId !== 'UNKNOWN') {
        explicitTraceId = msgObj.traceId;
      }

      if (
        !explicitTraceId &&
        typeof msgObj.error === 'object' &&
        msgObj.error !== null
      ) {
        const errObj = msgObj.error as Record<string, unknown>;
        if (
          typeof errObj.traceId === 'string' &&
          errObj.traceId !== 'UNKNOWN'
        ) {
          explicitTraceId = errObj.traceId;
        }
      }

      if (typeof msgObj.user === 'object' && msgObj.user !== null) {
        const userObj = msgObj.user as Record<string, unknown>;
        if (typeof userObj._id === 'string') {
          explicitUserId = userObj._id;
        }
      }
    }

    // 3. Fallback về AsyncLocalStorage
    const correlationId = explicitTraceId || RequestContext.getCorrelationId();
    const _id = explicitUserId || RequestContext.getUserId();

    info.service_name = serviceName;
    info.trace_id = correlationId || 'N/A';
    info._id = _id || 'anonymous';

    return info;
  })();

@Injectable()
export class CustomWinstonLogger implements LoggerService {
  private logger: winston.Logger;

  constructor(private readonly serviceName: string = 'app') {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        injectTraceContextFormat(this.serviceName),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf((info: LogInfo) => {
              const {
                timestamp,
                level,
                message,
                context,
                stack,
                trace_id,
                _id,
                service_name,
              } = info;
              //này là spread operator để gom các giá trị lại hay bị nhầm lần là gom lại

              const timeStr = safeString(timestamp);
              const levelStr = safeString(level);
              const svcStr = `[${safeString(service_name || 'App')}]`;
              const ctxStr = context ? `[${safeString(context)}]` : '[App]';
              const traceStr = `[TraceID: ${safeString(trace_id)}]`;
              const userStr =
                _id && _id !== 'anonymous' ? `[User: ${safeString(_id)}]` : '';
              const stackStr = stack ? `\n${safeString(stack)}` : '';

              let msgStr = '';
              if (typeof message === 'object' && message !== null) {
                msgStr = JSON.stringify(message, null, 2);
              } else {
                msgStr = safeString(message);
              }

              return `${svcStr} ${timeStr} [${levelStr}] ${ctxStr} ${traceStr}${userStr}: ${msgStr}${stackStr}`;
            }),
          ),
        }),

        // File Log tổng
        new DailyRotateFile({
          dirname: 'logs',
          filename: 'application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
        }),

        // File Log lỗi
        new DailyRotateFile({
          level: 'error',
          dirname: 'logs',
          filename: 'error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
        }),
      ],
    });
  }

  log(message: unknown, context?: string): void {
    this.logger.info(message as string, { context });
  }

  error(message: unknown, trace?: string, context?: string): void {
    if (trace && !context && !trace.includes('\n') && !trace.includes('at ')) {
      this.logger.error(message as string, { context: trace });
    } else {
      this.logger.error(message as string, { stack: trace, context });
    }
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(message as string, { context });
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(message as string, { context });
  }

  verbose(message: unknown, context?: string): void {
    this.logger.verbose(message as string, { context });
  }
}
