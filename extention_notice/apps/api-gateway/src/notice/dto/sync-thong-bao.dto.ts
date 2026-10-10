import {
  IsArray,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsDate,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// 1. DTO định nghĩa cấu trúc của MỘT bài viết thô
export class ThongBaoThoDto {
  @IsString()
  @IsNotEmpty({ message: 'ID bài viết không được để trống' })
  ID: string;

  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  TIEUDE: string;

  @IsString()
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  NOIDUNG: string;

  @IsString()
  @IsNotEmpty({ message: 'Chuyên mục không được để trống' })
  CHUYENMUC: string;

  @Transform(({ value }) => {
    // Nếu dữ liệu gửi lên là chuỗi (VD: "25/09/2026")
    if (typeof value === 'string') {
      const parts = value.split('/');
      if (parts.length === 3) {
        // parts[0] là ngày, parts[1] là tháng, parts[2] là năm
        // Tháng trong JS bắt đầu từ 0 nên phải trừ đi 1
        return new Date(
          Number(parts[2]),
          Number(parts[1]) - 1,
          Number(parts[0]),
        );
      }
    }
    return value;
  })
  @IsDate({ message: 'Ngày tạo phải là định dạng ngày hợp lệ' })
  @IsNotEmpty({ message: 'Ngày tạo không được để trống' })
  NGAYTAO: Date;
}

// 2. DTO định nghĩa cấu trúc của toàn bộ Request Body
export class SyncThongBaoDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Danh sách thông báo không được rỗng' })
  @ArrayMaxSize(30, { message: 'Chỉ được gửi tối đa 30 thông báo mỗi lần' })
  @ValidateNested({ each: true })
  @Type(() => ThongBaoThoDto)
  danhSachThongBao: ThongBaoThoDto[];
}
