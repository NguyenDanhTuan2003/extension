import { Controller } from '@nestjs/common';
import { NoticeServiceService } from './notice-service.service.js';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class NoticeServiceController {
  constructor(private readonly noticeServiceService: NoticeServiceService) {}

  @MessagePattern('get_notices')
  async getNotices(@Payload() q: string) {
    return this.noticeServiceService.getNotices(q);
  }

  @MessagePattern('get_danh_sach_khoa')
  async getDanhSachKhoa(@Payload() q: string) {
    return this.noticeServiceService.getDanhSachKhoa(q);
  }

  @MessagePattern('get_all_khoa')
  async getAllKhoa() {
    return this.noticeServiceService.getAllKhoa();
  }

  @MessagePattern('get_all_khoa_dao_tao')
  async getAllKhoaDaoTao() {
    return this.noticeServiceService.getAllKhoaDaoTao();
  }

  @MessagePattern('sync_notices')
  async syncNotices(@Payload() payload: { studentId: string; articles: any[] }) {
    return this.noticeServiceService.syncNotices(payload);
  }
}
