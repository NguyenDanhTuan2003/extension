import * as bcrypt from 'bcrypt';
//hàm dùng để băm mật khẩu
export const encodePassword = async (
  password: string,
  readenv: number,
): Promise<string> => {
  const encode = await bcrypt.hash(password, readenv);
  return encode;
};
//hàm dùng để so sánh mật khẩu
export const decodePassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  const decode = await bcrypt.compare(password, hash);
  return decode;
};
