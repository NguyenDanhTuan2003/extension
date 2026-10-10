import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Response, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { CustomWinstonLogger, RequestContext } from '../loggers/my.logger';
import { NatsContext } from '@nestjs/microservices';
import * as nats from 'nats';
import { RequestWithUser } from '../interfaces/context.interface';
interface CustomResponsePayload {
  message?: string;
  success?: boolean;
  data?: unknown;
  [key: string]: unknown;
}

interface RpcPayload {
  user?: {
    _id?: string;
    role?: string;
    [key: string]: unknown;
  };
  _id?: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly logger: CustomWinstonLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    //ExecutionContext cho biết ngữ cảnh mọi thứ mà món ăn do khách gọi bán số bao nhiêu có bao nhiêu người và ở vị trí nào còn argumenthost thì nếu có lỗi như có ruồi trong món nó chỉ đưa đúng khay đựng món k cung cấp vị trí khách hay thông tin khác
    const startTime = Date.now();
    const contextType = context.getType();

    let method = 'N/A';
    let url = 'N/A';
    let correlationId: string = randomUUID();
    let userId: string | undefined = undefined;
    let role: string | undefined = undefined;

    let reqBody: unknown = undefined;
    let reqQuery: unknown = undefined;
    let reqParams: unknown = undefined;

    // Gộp logic HTTP vào 1 khối duy nhất
    if (contextType === 'http') {
      const httpContext = context.switchToHttp();
      const request = httpContext.getRequest<RequestWithUser>();
      const response = httpContext.getResponse<Response>();

      method = request.method ?? 'UNKNOWN';
      url = request.originalUrl ?? request.url ?? 'UNKNOWN';
      reqBody = request.body;
      reqQuery = request.query;
      reqParams = request.params;

      const headerCorrelationId =
        request.headers['x-correlation-id'] ?? request.headers['x-trace-id'];

      if (typeof headerCorrelationId === 'string') {
        correlationId = headerCorrelationId;
      } else if (
        Array.isArray(headerCorrelationId) &&
        headerCorrelationId.length > 0
      ) {
        correlationId = headerCorrelationId[0];
      }

      //tự tạo id mới nếu k có
      request.headers['x-correlation-id'] = correlationId;
      request.headers['x-trace-id'] = correlationId;

      response.setHeader('X-Correlation-ID', correlationId);

      const user = request.user;
      userId = user?._id;
      role = user?.role;
    } else if (contextType === 'rpc') {
      const rpcContext = context.switchToRpc().getContext<NatsContext>();
      const rpcData: unknown = context.switchToRpc().getData();
      method = 'NATS';
      // Fix ESLint: Lấy headers và ép kiểu về nats.MsgHdrs
      const natsHeaders = rpcContext.getHeaders() as nats.MsgHdrs | undefined;

      if (natsHeaders) {
        // Fix ESLint: Ép kiểu kết quả lấy từ .get() về string | string[]
        const rawCorrelationId = natsHeaders.get('x-correlation-id') as
          string | string[] | null;
        const rawUserId = natsHeaders.get('x-user-id') as
          string | string[] | null;

        if (rawCorrelationId) {
          correlationId = Array.isArray(rawCorrelationId)
            ? rawCorrelationId[0]
            : rawCorrelationId;
        }

        if (rawUserId) {
          userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
        }
      }

      reqBody = rpcData;

      // Gắn payload của RPC vào reqBody để log ở tap()
      reqBody = rpcData;

      // Gộp chung logic xử lý rpcData vào 1 chuỗi if - else if
      if (typeof rpcContext.getSubject === 'function') {
        //đoạn này lấy 'leave_request.cancel' hoặc tên khác của nats nó lấy cổng hứng tin của Nats bắn lên
        url = rpcContext.getSubject();
      } else if (typeof rpcData === 'string') {
        url = rpcData;
      } else {
        url = 'UNKNOWN_RPC_PATTERN';
      }

      if (typeof rpcData === 'object' && rpcData !== null) {
        // Trích xuất thông tin user
        const payload = rpcData as RpcPayload;
        userId = userId ?? payload.user?._id ?? payload._id;
        role = role ?? payload.user?.role ?? payload.role;
      }
    }

    const handlerName = `${context.getClass().name}.${context.getHandler().name}.${correlationId}`;

    // 1. Log ĐẦU VÀO (INBOUND): Bắt đầu nhận request (bước A)
    this.logger.log(
      {
        type: contextType === 'http' ? 'INBOUND_REQUEST' : 'INBOUND_RPC',
        user: { _id: userId, role },
        protocol: contextType,
        network: {
          method,
          path: url,
        },
        requestBody: reqBody,
        query: reqQuery,
        params: reqParams,
        traceId: correlationId,
      },
      handlerName,
    );

    // các hàm bên dưới như run chạy nhanh nhung handle của rxjs lại chạy chậm hơn nên nếu k bọc Observablenos sẽ bỏ qua handle và chạy rỗng mà nó lại là Observable bản tính lười biếng nó k có nhiều thời gian chờ đợi nên phải bọc Observable bên ngoài cho nó chờ các hàm chạy
    return new Observable((subscriber) => {
      RequestContext.run(
        {
          correlationId,
          _id: userId,
          role,
        },
        () => {
          next
            //trước handle là dữ liệu đi vào nên trace id gửi vào thì ông service cũng bắt được
            .handle()
            .pipe(
              map((data: unknown) => {
                if (contextType === 'rpc') {
                  return data;
                }
                let statusCode = 200;

                if (contextType === 'http') {
                  const response = context
                    .switchToHttp()
                    .getResponse<Response>();
                  statusCode = response?.statusCode ?? 200;
                }

                let customMessage = 'Success';
                let customSuccess = true;
                let responseData: unknown = data;

                if (
                  typeof data === 'object' &&
                  data !== null &&
                  !Array.isArray(data)
                ) {
                  const payload = data as CustomResponsePayload;

                  if (typeof payload.message === 'string') {
                    customMessage = payload.message;
                  }

                  if (typeof payload.success === 'boolean') {
                    customSuccess = payload.success;
                  }

                  if (payload.data !== undefined) {
                    responseData = payload.data;
                  } else {
                    const { message, success, ...rest } = payload;
                    void message;
                    void success;
                    responseData = rest;
                  }
                }

                // Trả về chung 1 format cho cả HTTP lẫn RPC
                return {
                  traceId: correlationId,
                  success: customSuccess,
                  statusCode: statusCode, // Với RPC nó sẽ mặc định là 200
                  message: customMessage,
                  timestamp: new Date().toISOString(),
                  data: responseData ?? {},
                };
              }),
              tap((transformedResult: unknown) => {
                const duration = Date.now() - startTime;

                let resStatusCode = 200;
                let resSuccess = true;

                // Kiểm tra chặt chẽ: phải là HTTP và transformedResult phải là object
                if (
                  contextType === 'http' &&
                  typeof transformedResult === 'object' &&
                  transformedResult !== null
                ) {
                  // Ép kiểu về dạng object an toàn (Record) thay vì any
                  const resObj = transformedResult as Record<string, unknown>;

                  if (typeof resObj.statusCode === 'number') {
                    resStatusCode = resObj.statusCode;
                  }

                  if (typeof resObj.success === 'boolean') {
                    resSuccess = resObj.success;
                  }
                }

                // 2. Log ĐẦU RA (OUTBOUND): Hoàn tất xử lý và chuẩn bị trả response (bước C)
                this.logger.log(
                  {
                    type:
                      contextType === 'http'
                        ? 'OUTBOUND_RESPONSE'
                        : 'OUTBOUND_RPC',
                    user: { _id: userId, role },
                    protocol: contextType,
                    network: {
                      method,
                      path: url,
                      statusCode: resStatusCode,
                      latency_ms: duration,
                    },
                    success: resSuccess,

                    requestBody: reqBody,
                    query: reqQuery,
                    params: reqParams,

                    responseBody: transformedResult, // Dữ liệu trả về (của cả HTTP lẫn NATS)

                    traceId: correlationId,
                  },
                  handlerName,
                );
              }),
            )
            .subscribe(subscriber);
        },
      );
    });
  }
}
