import { RpcException } from '@nestjs/microservices';
export interface CustomErrorShape {
  name?: string;
  statusCode?: number;
  status?: number;
  message?: string | string[];
  response?: {
    statusCode?: number;
    message?: string | string[];
    name?: string;
  };
}
export function createRpcError(err: CustomErrorShape) {
  if (err?.name === 'TimeoutError') {
    return new RpcException({
      statusCode: 504,
      message: 'request timeout (Nat không phản hồi sau 5s)',
      error: `request timeout `,
    });
  }
  const statusCode =
    err?.statusCode || err?.status || err?.response?.statusCode || 500;
  const message = err?.message || err?.response?.message || 'Có lỗi xảy ra!';
  const errName = err?.name || err?.response?.name || 'Error';

  return new RpcException({
    statusCode: statusCode,
    message: message,
    error: errName,
  });
}
