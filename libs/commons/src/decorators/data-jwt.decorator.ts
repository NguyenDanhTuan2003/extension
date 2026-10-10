import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IUser } from '../interfaces/user.interface';

interface RequestWithUser extends Request {
  user?: IUser;
}

export const CurrentUser = createParamDecorator(
  (data: keyof IUser | undefined, ctx: ExecutionContext) => {
    //keyof IUser dùng để chốt kèo với nest là tôi chỉ truyền 5 kiểu dữ liệu này
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    const user = request.user;
    if (!user) {
      return undefined;
    }
    if (data) {
      return user[data];
    }
    return user;
  },
  //bản chất hàm này là 1 callbackfunction trả về 1 hàm cho createParamDecorator
  //tôi đang truyền tham số là 1 callbackfunction cho hàm này
);
