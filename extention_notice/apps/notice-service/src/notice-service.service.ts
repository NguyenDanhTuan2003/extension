import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notice } from './schema/notice.schema';
import {
  mongoUniversalGet,
  mongoUniversalDistinct,
} from '@app/commons/utils/mongo-query.util';
import { REDIS_CLIENT } from '@app/commons/database/redis.module';
import Redis from 'ioredis';
import { GeminiService } from '@app/commons/gemini/gemini.service';
import { createRpcError } from '@app/commons/helpers/throw_nat_custom';
import { CustomWinstonLogger } from '@app/commons/loggers/my.logger';

@Injectable()
export class NoticeServiceService {
  private readonly logger = new CustomWinstonLogger('NoticeServiceService');

  constructor(
    @InjectModel(Notice.name)
    private readonly noticeModel: Model<Notice>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly geminiService: GeminiService,
  ) {}

  async getNotices(q: string) {
    return mongoUniversalGet(this.noticeModel, q, {
      sort: { ngayTao: -1 },
      limit: 10,
    });
  }

  async getDanhSachKhoa(q: string) {
    return mongoUniversalDistinct(this.noticeModel, 'khoaApDung', q);
  }

  async getAllKhoa(): Promise<number[]> {
    const values = await this.noticeModel.distinct('khoaApDung').exec();
    return values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => Number(value))
      .filter((value, index, list) => Number.isFinite(value) && list.indexOf(value) === index)
      .sort((a, b) => b - a);
  }

  async getAllKhoaDaoTao(): Promise<string[]> {
    const values = await this.noticeModel.distinct('khoaDaoTao').exec();
    return values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value).trim())
      .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b, 'vi'));
  }

  async syncNotices(payload: { studentId: string; articles: any[] }) {
    const { studentId, articles } = payload;

    // 2. Thiết lập chốt chặn bảo vệ (Redis Lock)
    const lockKey = `sync_lock:${studentId}`;
    const isLocked = await this.redis.get(lockKey);

    if (isLocked) {
      throw createRpcError({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Hệ thống đang xử lý đồng bộ, vui lòng không gửi liên tục!',
        name: 'TooManyRequests',
      });
    }

    // Đặt khóa (TTL 60s)
    await this.redis.set(lockKey, 'locked', 'EX', 60);

    try {
      // 3. Sàng lọc dữ liệu mới (MongoDB)
      const incomingIds = articles.map((a) => a.ID); // Gốc của bài viết
      const existingNotices = await this.noticeModel
        .find({ _id: { $in: incomingIds } }, { _id: 1 })
        .lean();

      const existingIds = new Set(existingNotices.map((n) => n._id)); // set tự loại bỏ trùng
      const newArticles = articles.filter((a) => !existingIds.has(a.ID));

      if (newArticles.length === 0) {
        return { message: 'Đã bỏ qua, không có bài viết mới nào cần đồng bộ' };
      }

      // 4. Giao việc cho AI — Batch call: gộp tất cả bài vào 1 prompt, gọi Gemini 1 lần duy nhất
      const processedArticles = [];

      // Xây dựng danh sách bài viết cho prompt
      const articlesInput = newArticles
        .map(
          (a, i) => `[${i}]
Tiêu đề: ${a.TIEUDE}
Nội dung: ${a.NOIDUNG || '(không có nội dung)'}`,
        )
        .join('\n\n');

      const batchPrompt = `Bạn là một hệ thống phân tích dữ liệu tự động của trường Đại học.
Nhiệm vụ: Đọc danh sách ${newArticles.length} thông báo bên dưới và trích xuất thông tin theo đúng định dạng JSON.
Tuyệt đối KHÔNG giải thích, KHÔNG trả về văn bản nào khác ngoài chuỗi JSON hợp lệ duy nhất.

--- DANH SÁCH THÔNG BÁO ĐẦU VÀO ---
${articlesInput}

--- QUY TẮC TRÍCH XUẤT (áp dụng cho từng thông báo) ---
1. "tomTat": Mảng chứa tối đa 3 ý tóm tắt. Mỗi ý PHẢI là một câu hoàn chỉnh, trọn nghĩa, có thể đứng độc lập (đủ chủ ngữ - vị ngữ - kết luận). Tập trung vào thông tin cốt lõi: thời gian, địa điểm, yêu cầu, hạn chót, hậu quả nếu vi phạm. KHÔNG được viết câu bị cắt ngang hoặc thiếu kết luận.
2. "khoaApDung": Mảng SỐ NGUYÊN chỉ định Khóa sinh viên (ví dụ: K64, Khóa 65 -> [64, 65]). Nếu toàn trường hoặc không giới hạn khóa -> trả về [].
3. "khoaDaoTao": Mảng CHUỖI tên Khoa/Viện đầy đủ, tiếng Việt có dấu (ví dụ: "Khoa Công nghệ thông tin"). Nếu toàn trường -> trả về [].

--- ĐỊNH DẠNG ĐẦU RA BẮT BUỘC ---
Trả về một mảng JSON có đúng ${newArticles.length} phần tử, theo ĐÚNG THỨ TỰ tương ứng với [0], [1], [2]... ở trên:
[
  { "tomTat": [...], "khoaApDung": [], "khoaDaoTao": [] },
  { "tomTat": [...], "khoaApDung": [], "khoaDaoTao": [] }
]`;

      // Gọi Gemini 1 lần duy nhất với retry cho lỗi 503
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      let batchResponseString = '[]';
      let retries = 3;

      while (retries > 0) {
        try {
          batchResponseString =
            await this.geminiService.generateText(batchPrompt);
          break; // Thành công
        } catch (e: any) {
          const httpStatus = e?.status ?? e?.error?.code;

          if (httpStatus === 429) {
            // Hết quota → không retry, fallback toàn bộ về rỗng
            this.logger.error(
              `[Gemini] Hết quota (429). Bỏ qua AI, lưu toàn bộ ${newArticles.length} bài với dữ liệu rỗng. Chi tiết: ${e.message}`,
              undefined,
              'GeminiService',
            );
            break;
          }

          // Lỗi 503 hoặc lỗi khác → retry
          retries--;
          if (retries === 0) {
            this.logger.error(
              `[Gemini] Batch call thất bại sau 3 lần thử (status: ${httpStatus}). Chi tiết: ${e.message}`,
              e.stack,
              'GeminiService',
            );
          } else {
            this.logger.warn(
              `[Gemini] Lỗi tạm thời (status: ${httpStatus}). Thử lại sau 5s... (còn ${retries} lần)`,
              'GeminiService',
            );
            await delay(5000);
          }
        }
      }

      // Parse mảng JSON trả về từ Gemini
      let aiResultArray: any[] = [];
      try {
        const cleanJson = batchResponseString
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        const parsed = JSON.parse(cleanJson);
        aiResultArray = Array.isArray(parsed) ? parsed : [];
      } catch (e: any) {
        this.logger.error(
          `[Gemini] Lỗi parse batch JSON: ${e.message}`,
          e.stack,
          'GeminiService',
        );
        aiResultArray = [];
      }

      // 5. Map kết quả AI về từng bài viết theo index
      for (let i = 0; i < newArticles.length; i++) {
        const article = newArticles[i];
        const aiData = aiResultArray[i] ?? {
          tomTat: [],
          khoaApDung: [],
          khoaDaoTao: [],
        };

        let parsedDate = article.NGAYTAO
          ? new Date(article.NGAYTAO)
          : new Date();
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date();
        }

        processedArticles.push({
          _id: String(article.ID),
          tieuDe: article.TIEUDE,
          chuyenMuc: article.CHUYENMUC,
          ngayTao: parsedDate,
          tomTat: Array.isArray(aiData.tomTat) ? aiData.tomTat : [],
          khoaApDung: Array.isArray(aiData.khoaApDung) ? aiData.khoaApDung : [],
          khoaDaoTao: Array.isArray(aiData.khoaDaoTao) ? aiData.khoaDaoTao : [],
        });
      }

      // Ghi vào cơ sở dữ liệu (Lưu MongoDB)
      if (processedArticles.length > 0) {
        await this.noticeModel.insertMany(processedArticles);
      }

      return {
        message: `Đã đồng bộ thành công ${processedArticles.length} bài viết mới`,
      };
    } finally {
      // 6. Mở khóa và Báo cáo (Tầng Finally)
      await this.redis.del(lockKey);
    }
  }
}
