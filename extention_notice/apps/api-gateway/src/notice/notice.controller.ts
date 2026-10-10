import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { NoticeService } from './notice.service';
import { SyncThongBaoDto } from './dto/sync-thong-bao.dto';

@Controller('notice')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Get()
  async getNotices(@Query('q') q: string) {
    return this.noticeService.getNotices(q);
  }

  @Get('danh-sach-khoa')
  async getDanhSachKhoa(@Query('q') q: string) {
    return this.noticeService.getDanhSachKhoa(q);
  }

  @Get('khoa')
  async getAllKhoa() {
    return this.noticeService.getAllKhoa();
  }

  @Get('khoa-dao-tao')
  async getAllKhoaDaoTao() {
    return this.noticeService.getAllKhoaDaoTao();
  }

  @Post('')
  async syncNotices(
    @Headers('x-student-id') studentId: string,
    @Body() body: SyncThongBaoDto,
  ) {
    if (!studentId) {
      throw new BadRequestException('Missing x-student-id header');
    }
    return this.noticeService.syncNotices({
      studentId,
      articles: body.danhSachThongBao,
    });
  }
}
