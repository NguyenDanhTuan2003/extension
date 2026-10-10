import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NoticeDocument = HydratedDocument<Notice>;

@Schema({
  timestamps: true,
  _id: false,
})
export class Notice {
  // 1. Dùng chính ID gốc của bài viết trên web trường làm Primary Key
  @Prop({ type: String, required: true })
  _id: string;

  // 2. Tiêu đề bài viết (Lấy từ web trường)
  @Prop({ type: String, required: true })
  tieuDe: string;

  // 3. Chuyên mục đã phân loại (daotao, nhatruong, hoatdongsv)
  @Prop({ type: String, required: true, index: true })
  chuyenMuc: string;

  // 4. Ngày tạo bài viết (Chuyển sang kiểu Date để dễ sort giảm dần)
  @Prop({ type: Date, required: true, index: true })
  ngayTao: Date;

  // 5. Kết quả từ Gemini: Mảng các câu tóm tắt
  @Prop({ type: [String], required: true })
  tomTat: string[];

  // 6. Kết quả từ Gemini: Khóa áp dụng (K64, K65...). Mảng rỗng = Toàn trường
  @Prop({ type: [Number], default: [] })
  khoaApDung: number[];

  // 7. Kết quả từ Gemini: Khoa đào tạo (Khoa CNTT...). Mảng rỗng = Toàn trường
  @Prop({ type: [String], default: [] })
  khoaDaoTao: string[];
}

export const NoticeSchema = SchemaFactory.createForClass(Notice);
