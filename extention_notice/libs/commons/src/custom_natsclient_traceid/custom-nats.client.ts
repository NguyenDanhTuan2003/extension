import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ClientProxy,
  NatsRecord,
  NatsRecordBuilder,
} from '@nestjs/microservices';
import * as nats from 'nats';
import { CustomWinstonLogger, RequestContext } from '../loggers/my.logger';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { createRpcError, CustomErrorShape } from '../helpers/throw_nat_custom';

// File này code để gắn traceid vào header để các service có thể trace trong interceptor
@Injectable()
export class CustomNatsClient {
  constructor(
    @Inject('NATS_SERVICE') private readonly client: ClientProxy,
    @Optional() private readonly logger?: CustomWinstonLogger,
  ) {}

  private buildRecord<T>(data: T): NatsRecord {
    const correlationId = RequestContext.get('correlationId');
    const userId = RequestContext.get('_id');
    // Ghi đè nếu dev khác muốn gắn id của họ vào header

    let headers: nats.MsgHdrs;
    let payload: unknown = data;

    // Phân giải payload và headers
    if (data instanceof NatsRecord) {
      headers = (data.headers as nats.MsgHdrs) || nats.headers();
      payload = data.data;
    } else {
      headers = nats.headers();
    }

    // Xử lý đính kèm Context
    if (correlationId && !headers.has('x-correlation-id')) {
      headers.set('x-correlation-id', correlationId);
    }
    if (userId && !headers.has('x-user-id')) {
      headers.set('x-user-id', userId);
    }

    return new NatsRecordBuilder(payload).setHeaders(headers).build();
  }

  emit<TResult = any, TInput = any>(
    pattern: string,
    data: TInput,
  ): Observable<TResult> {
    const correlationId = RequestContext.get('correlationId');
    if (this.logger) {
      this.logger.log(
        {
          type: 'RPC_EMIT',
          pattern,
          payload: data,
          traceId: correlationId,
        },
        `CustomNatsClient.${pattern}.${correlationId || 'N/A'}`,
      );
    }

    return this.client
      .emit<TResult, NatsRecord>(pattern, this.buildRecord(data))
      .pipe(
        catchError((err: unknown) => {
          if (this.logger) {
            this.logger.error(
              {
                type: 'RPC_EMIT_ERROR',
                pattern,
                error: err,
                traceId: correlationId,
              },
              `CustomNatsClient.${pattern}.${correlationId || 'N/A'}`,
            );
          }
          return throwError(() => err);
        }),
      );
  }

  send<TResult = unknown, TInput = unknown>(
    pattern: string,
    data: TInput,
  ): Observable<TResult> {
    const correlationId = RequestContext.get('correlationId');
    if (this.logger) {
      this.logger.log(
        {
          type: 'RPC_DISPATCH',
          pattern,
          payload: data,
          traceId: correlationId,
        },
        `CustomNatsClient.${pattern}.${correlationId || 'N/A'}`,
      );
    }

    return this.client
      .send<TResult, NatsRecord>(pattern, this.buildRecord(data))
      .pipe(
        timeout(120000),
        catchError((err: unknown) => {
          if (this.logger) {
            this.logger.error(
              {
                type: 'RPC_DISPATCH_ERROR',
                pattern,
                error: err,
                traceId: correlationId,
              },
              `CustomNatsClient.${pattern}.${correlationId || 'N/A'}`,
            );
          }
          return throwError(() => createRpcError(err as CustomErrorShape));
        }),
      );
  }
}
