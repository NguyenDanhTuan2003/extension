import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsCustomPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    void args;
    if (!password) return false;

    // Giải thích biểu thức chính quy (Regex) kiểm tra mật khẩu:
    // ^                     : Bắt đầu chuỗi
    // (?=.*[a-z])           : Phải chứa ít nhất 1 chữ cái in thường (a-z)
    // (?=.*[A-Z])           : Phải chứa ít nhất 1 chữ cái in hoa (A-Z)
    // (?=.*\\d)              : Phải chứa ít nhất 1 chữ số (\\d tương đương 0-9)
    // (?=.*[@$!%*?&])       : Phải chứa ít nhất 1 ký tự đặc biệt trong tập @$!%*?&
    // [A-Za-z\\d@$!%*?&]{6,} : Chuỗi chỉ được chứa chữ hoa, chữ thường, số, ký tự đặc biệt và độ dài tổng cộng tối thiểu 6 ký tự
    // $                     : Kết thúc chuỗi
    const regex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

    return typeof password === 'string' && regex.test(password);
  }
  defaultMessage(args: ValidationArguments) {
    void args;

    return 'Mật khẩu yếu phải có ít nhất 6 ký tự có chữ hoa, chữ thường và kí tự số';
  }
}
export function IsCustomPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCustomPasswordConstraint,
    });
  };
}
