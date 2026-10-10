import { Model, PopulateOptions } from 'mongoose';

/**
 * TỔNG QUAN CẤU TRÚC FILE:
 * Bước 1. CÁC HẰNG SỐ BẢO MẬT & GIỚI HẠN: Chứa các cấu hình an toàn (độ sâu tối đa, độ dài mảng, danh sách operator cho phép) để chống NoSQL Injection.
 * Bước 2. CÁC HÀM HELPER XỬ LÝ DỮ LIỆU & TYPE GUARDS: Các hàm hỗ trợ (kiểm tra Object, ép kiểu Date an toàn, và hàm đệ quy processMongoOperators lọc bỏ dữ liệu độc hại).
 * Bước 3. INTERFACE CHO PAYLOAD: Định nghĩa schema (MongoQueryPayload) cho các options query truyền vào (where, page, limit, sort, select, populate).
 * Bước 4. HÀM CHÍNH (mongoUniversalGet): Hàm trực tiếp gọi vào DB, nhận query payload, làm sạch dữ liệu, ráp với defaultOptions và trả về kết quả an toàn.
 */

// ============================================================================
// 1. CÁC HẰNG SỐ BẢO MẬT & GIỚI HẠN
// ============================================================================
const MAX_DEPTH = 8;
const MAX_ARRAY_LENGTH = 100;

const ALLOWED_OPERATORS = new Set([
  '$eq',
  '$gt',
  '$gte',
  '$in',
  '$lt',
  '$lte',
  '$ne',
  '$nin',
  '$and',
  '$not',
  '$nor',
  '$or',
  '$type',
  '$regex',
  '$options',
  '$all',
  '$elemMatch',
  '$size',
]);

// ============================================================================
// 2. CÁC HÀM HELPER XỬ LÝ DỮ LIỆU & TYPE GUARDS
// ============================================================================
// kiểm tra có phải object chuẩn hay k hay là null hoặc array
const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  return Object.prototype.toString.call(obj) === '[object Object]';
};
// kiểm tra có phải date không
const parseDateSafe = (value: unknown): unknown => {
  // Biểu thức chính quy (Regex) để kiểm tra định dạng ISO Date:
  // - ^\d{4}-\d{2}-\d{2}: Bắt buộc phần ngày tháng năm theo định dạng YYYY-MM-DD
  // - (T\d{2}:\d{2}:\d{2}: (Tùy chọn) Bắt đầu bằng chữ 'T', theo sau là giờ:phút:giây (HH:mm:ss)
  // - (\.\d+)?: (Tùy chọn) Phần thập phân của giây (milli-giây, micro-giây...), ví dụ: .123
  // - (Z|[+-]\d{2}:\d{2})?)?: (Tùy chọn) Ký hiệu múi giờ, có thể là 'Z' (UTC) hoặc bù giờ '+07:00', '-05:00'
  const isoDateRegex =
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (typeof value === 'string' && isoDateRegex.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
};

interface StackItem {
  source: Record<string, unknown> | unknown[];
  target: Record<string, unknown> | unknown[];
  depth: number;
}
// kiểm tra xem các toán tử mongo client gửi lên có phải là toán tử hợp lệ không
const processMongoOperators = (queryObj: unknown): Record<string, unknown> => {
  if (!isPlainObject(queryObj)) return {};

  const result: Record<string, unknown> = {};
  const stack: StackItem[] = [{ source: queryObj, target: result, depth: 0 }];

  while (stack.length > 0) {
    const currentTask = stack.pop();
    if (!currentTask) continue;

    const { source, target, depth } = currentTask;

    if (depth > MAX_DEPTH) {
      throw new Error('Nesting too deep');
    }

    if (Array.isArray(source) && Array.isArray(target)) {
      if (source.length > MAX_ARRAY_LENGTH) {
        throw new Error('Array too large');
      }
      for (let i = 0; i < source.length; i++) {
        const value = source[i];
        if (isPlainObject(value)) {
          const newTarget: Record<string, unknown> = {};
          target[i] = newTarget;
          stack.push({ source: value, target: newTarget, depth: depth + 1 });
        } else if (Array.isArray(value)) {
          const newTarget: unknown[] = [];
          target[i] = newTarget;
          stack.push({ source: value, target: newTarget, depth: depth + 1 });
        } else {
          target[i] = parseDateSafe(value);
        }
      }
    } else if (isPlainObject(source) && isPlainObject(target)) {
      for (const [key, value] of Object.entries(source)) {
        if (key.startsWith('$') && !ALLOWED_OPERATORS.has(key)) continue;

        if (isPlainObject(value)) {
          const newTarget: Record<string, unknown> = {};
          target[key] = newTarget;
          stack.push({ source: value, target: newTarget, depth: depth + 1 });
        } else if (Array.isArray(value)) {
          const newTarget: unknown[] = [];
          target[key] = newTarget;
          stack.push({ source: value, target: newTarget, depth: depth + 1 });
        } else {
          target[key] = parseDateSafe(value);
        }
      }
    }
  }

  return result;
};

// ============================================================================
// 3. INTERFACE CHO PAYLOAD
// ============================================================================
export interface MongoQueryPayload {
  where?: Record<string, unknown>;
  page?: number;
  limit?: number;
  sort?: string | Record<string, 1 | -1 | 'asc' | 'desc'>;
  select?: string | string[] | Record<string, 0 | 1>;
  // Kiểu chuẩn xác 100% của Mongoose
  populate?: string | PopulateOptions | (string | PopulateOptions)[];
}
// ============================================================================
// 4. HÀM CHÍNH (GỌI TẠI CONTROLLER VÀ SERVICE)
// ============================================================================
export async function mongoUniversalGet<T>(
  model: Model<T>,
  payload?: string | Record<string, unknown>,
  defaultOptions?: Partial<MongoQueryPayload>,
): Promise<T[]> {
  try {
    let where: Record<string, unknown> = defaultOptions?.where || {};
    let page = defaultOptions?.page || 1;
    let limit = defaultOptions?.limit || 20;
    let sort: string | Record<string, 1 | -1 | 'asc' | 'desc'> =
      defaultOptions?.sort || { _id: -1 };
    let select = defaultOptions?.select;
    let populate = defaultOptions?.populate;

    if (payload) {
      let parsed: unknown;

      if (typeof payload === 'string') {
        parsed = JSON.parse(payload);
      } else if (isPlainObject(payload)) {
        parsed = payload;
      }

      if (!isPlainObject(parsed)) return [];

      const parsedPayload = parsed as MongoQueryPayload;

      if (parsedPayload.where && isPlainObject(parsedPayload.where)) {
        const feWhere = processMongoOperators(parsedPayload.where);
        where = { ...feWhere, ...defaultOptions?.where };
      }

      if (parsedPayload.page) page = Number(parsedPayload.page) || page;
      if (parsedPayload.limit) limit = Number(parsedPayload.limit) || limit;
      if (parsedPayload.sort) sort = parsedPayload.sort;
      if (parsedPayload.select) select = parsedPayload.select;
      if (parsedPayload.populate) populate = parsedPayload.populate;
    }

    const skip = (page - 1) * limit;

    // Truyền thẳng nơi không cần ép kiểu
    const query = model.find(where).skip(skip).limit(limit).sort(sort);

    if (select) query.select(select);

    if (populate) {
      if (typeof populate === 'string') {
        // Mongoose gọi Overload 1: populate(path: string)
        query.populate(populate);
      } else {
        // Mongoose gọi Overload 2: populate(options: PopulateOptions | Array)
        query.populate(populate);
      }
    }
    const result = await query.exec();
    return result || [];
  } catch {
    return [];
  }
}

// ============================================================================
// 5. HÀM DISTINCT (GỌI TẠI CONTROLLER VÀ SERVICE ĐỂ LẤY CÁC GIÁ TRỊ UNIQUE)
// ============================================================================
export async function mongoUniversalDistinct<T>(
  model: Model<T>,
  field: string,
  payload?: string | Record<string, unknown>,
  defaultOptions?: Partial<MongoQueryPayload>,
): Promise<unknown[]> {
  try {
    let where: Record<string, unknown> = defaultOptions?.where || {};

    if (payload) {
      let parsed: unknown;

      if (typeof payload === 'string') {
        parsed = JSON.parse(payload);
      } else if (isPlainObject(payload)) {
        parsed = payload;
      }

      if (isPlainObject(parsed)) {
        const parsedPayload = parsed as MongoQueryPayload;
        if (parsedPayload.where && isPlainObject(parsedPayload.where)) {
          const feWhere = processMongoOperators(parsedPayload.where);
          where = { ...feWhere, ...defaultOptions?.where };
        }
      }
    }

    const result = await model.distinct(field, where).exec();
    return result || [];
  } catch {
    return [];
  }
}
