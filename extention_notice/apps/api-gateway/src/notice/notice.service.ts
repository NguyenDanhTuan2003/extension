import { Injectable } from '@nestjs/common';
import { CustomNatsClient } from '@app/commons/custom_natsclient_traceid/custom-nats.client';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NoticeService {
  constructor(private readonly natsClient: CustomNatsClient) {}

  async getNotices(q: string) {
    // Gọi sang Notice Service thông qua NATS, pattern giả định là 'get_notices'
    return firstValueFrom(this.natsClient.send('get_notices', q));
  }

  async getDanhSachKhoa(q: string) {
    return firstValueFrom(this.natsClient.send('get_danh_sach_khoa', q || {}));
  }

  async getAllKhoa() {
    return firstValueFrom(this.natsClient.send('get_all_khoa', {}));
  }

  async getAllKhoaDaoTao() {
    return firstValueFrom(this.natsClient.send('get_all_khoa_dao_tao', {}));
  }

  async syncNotices(payload: { studentId: string; articles: any[] }) {
    return firstValueFrom(this.natsClient.send('sync_notices', payload));
  }
}
