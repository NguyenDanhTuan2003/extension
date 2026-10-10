import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Kích hoạt plugin múi giờ
dayjs.extend(utc);
dayjs.extend(timezone);

export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;

          // Khai báo rõ ràng type Dayjs
          let dateToValidate: Dayjs;

          if (value instanceof Date || typeof value === 'number') {
            dateToValidate = dayjs(value);
          } else if (typeof value === 'string') {
            let dateString = value.trim().replace(' ', 'T');
            if (
              !dateString.endsWith('Z') &&
              !dateString.match(/[+-]\d{2}:\d{2}$/)
            ) {
              dateString += '+07:00';
            }
            dateToValidate = dayjs(dateString);
          } else {
            return false;
          }

          if (!dateToValidate.isValid()) return false;

          const now: Dayjs = dayjs().tz('Asia/Ho_Chi_Minh');

          return dateToValidate.isAfter(now);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} phải lớn hơn thời gian hiện tại`;
        },
      },
    });
  };
}
