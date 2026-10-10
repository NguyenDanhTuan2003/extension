import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomWinstonLogger, RequestContext } from '../loggers/my.logger';
import { NatsContext } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import * as nats from 'nats';

//decorator Catch dùng để bắt tất cả các lỗi của app
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomWinstonLogger) {}

  // 1. Helper kiểm tra và ép kiểu Status Code hợp lệ
  private parseStatusCode(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599
      ? parsed
      : fallback;
  }

  // 2. Helper parse dữ liệu nếu bị bọc dạng String JSON (Type Safe)
  private safeParseJson(data: unknown): unknown {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        return data;
      }
    }
    return data;
  }

  // 3. Helper kiểm tra đối tượng Record kiểu an toàn
  private isObject(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null;
  }

  private returnErrorAndMessage(exception: unknown) {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    // TH 1: HTTP Exception tiêu chuẩn (REST Direct Call)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resResponse = exception.getResponse();

      if (this.isObject(resResponse) && 'message' in resResponse) {
        const errorBody = resResponse as { message: string | string[] };
        message = errorBody.message;
        //lỗi này thường là dto và throw ném vào obj
      } else if (typeof resResponse === 'string') {
        message = resResponse;
        //lỗi này thường là throw chỉ viết string
      } else {
        message = exception.message;
        //lỗi còn lại k biết sẽ name vào thư viện mặc định bắt ttas cả các lỗi đc viết bởi js
      }
    }
    // TH 2: Lỗi truyền qua NATS Microservice / RPC Proxy
    else if (this.isObject(exception)) {
      const errObj = exception;

      // Tìm vị trí chứa thông tin lỗi chính
      const rawPayload = errObj.error ?? errObj.response ?? errObj;
      const parsedError = this.safeParseJson(rawPayload);

      if (this.isObject(parsedError)) {
        // Lấy status code từ các vị trí phổ biến
        const rawStatus =
          parsedError.statusCode ??
          parsedError.status ??
          errObj.statusCode ??
          errObj.status;

        statusCode = this.parseStatusCode(rawStatus, statusCode);

        // Lấy message
        const rawMsg = parsedError.message ?? errObj.message;
        if (typeof rawMsg === 'string' || Array.isArray(rawMsg)) {
          message = rawMsg as string | string[];
        }
      } else if (typeof parsedError === 'string') {
        message = parsedError;
      }
    } else if (typeof exception === 'string') {
      message = exception;
    }

    // Đảm bảo tuyệt đối statusCode là Integer hợp lệ
    statusCode = this.parseStatusCode(
      statusCode,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    return { statusCode, message };
  }

  //hàm bắt lỗi
  catch(exception: unknown, host: ArgumentsHost): Observable<unknown> | void {
    const traceId = RequestContext.getCorrelationId();
    const hosttype = host.getType();
    const { message, statusCode } = this.returnErrorAndMessage(exception);
    const handlerName = AllExceptionsFilter.name;
    //bắt lỗi nguồn tưf đâu:
    const stack =
      exception instanceof Error
        ? exception.stack
        : this.isObject(exception)
          ? ((exception.stack ??
              (exception.error as Record<string, unknown>)?.stack) as string)
          : undefined;

    if (hosttype == 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
      const traceId =
        RequestContext.getCorrelationId() ??
        (request.headers['x-trace-id'] as string) ??
        (request.headers['x-correlation-id'] as string) ??
        'UNKNOWN';
      // ghi log vào winston
      this.logger.error(
        {
          type: 'INBOUND_ERROR',
          http: {
            method: request.method,
            path: request.originalUrl ?? request.url,
            statusCode,
          },
          error: {
            traceId: traceId ?? 'UNKNOWN',
            message,
            stack,
          },
          traceId: traceId ?? 'UNKNOWN',
        },
        handlerName,
      );
      // TRẢ VỀ CHO CLIENT
      response.status(statusCode).json({
        success: false,
        statusCode,
        traceId: traceId ?? 'UNKNOWN',
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    } else if (hosttype == 'rpc') {
      const rpcCtx = host.switchToRpc();

      const natsContext = rpcCtx.getContext<NatsContext>();
      // cái này nó in ra cái tên abc của @messagepattern('abc')
      const pattern: string =
        typeof natsContext?.getSubject === 'function'
          ? natsContext.getSubject()
          : 'UNKNOWN_PATTERN';

      let rpcTraceId = traceId;
      if (
        !rpcTraceId &&
        natsContext &&
        typeof natsContext.getHeaders === 'function'
      ) {
        const headers = natsContext.getHeaders() as nats.MsgHdrs | undefined;
        const rawTrace = headers?.get('x-correlation-id');
        if (rawTrace) {
          rpcTraceId = rawTrace;
        }
      }

      this.logger.error(
        {
          type: 'NATS_RPC_ERROR',
          pattern: pattern,
          error: {
            statusCode,
            traceId: rpcTraceId ?? 'UNKNOWN',
            message,
            stack,
          },
          traceId: rpcTraceId ?? 'UNKNOWN',
        },
        handlerName,
      );
      //k muốn dừng hệ thống khiến crash xác định được lỗi thì dùng catcherr
      return throwError(() => {
        return {
          success: false,
          statusCode,
          traceId: rpcTraceId ?? 'UNKNOWN',
          message,
          stack,
          timestamp: new Date().toISOString(),
        };
      });
    } else {
      this.logger.error(
        { type: 'UNKNOWN_ERROR', error: { message, stack } },
        handlerName,
      );
    }
  }
}
