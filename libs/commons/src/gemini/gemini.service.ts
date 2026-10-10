import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { CustomWinstonLogger } from '../loggers/my.logger';

@Injectable()
export class GeminiService {
  private readonly logger = new CustomWinstonLogger('GeminiService');
  private ai: GoogleGenAI;
  private defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash-lite';

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not defined in environment variables. Gemini AI will not work.',
      );
    }

    // Khởi tạo bộ SDK Google Gen AI chính thức
    this.ai = new GoogleGenAI({ apiKey: apiKey || '' });
  }

  /**
   * Tạo văn bản từ một đoạn prompt đơn giản
   * @param prompt Đoạn text prompt để hỏi Gemini
   * @param systemInstruction Hướng dẫn hệ thống (tùy chọn) để điều hướng hành vi của model
   */
  async generateText(
    prompt: string,
    systemInstruction?: string,
  ): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.defaultModel,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      return response.text || '';
    } catch (error: any) {
      this.logger.error(
        `Error generating text from Gemini: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Chế độ trò chuyện (Chat)
   * @param message Tin nhắn mới của người dùng
   * @param history Lịch sử trò chuyện trước đó (nếu có)
   */
  async chat(message: string, history: any[] = []): Promise<string> {
    try {
      // Bạn có thể triển khai tính năng phiên trò chuyện bằng cách sử dụng SDK
      const chatSession = this.ai.chats.create({
        model: this.defaultModel,
        // SDK có thể yêu cầu định dạng cụ thể cho history, hãy điều chỉnh cho phù hợp
      });

      const response = await chatSession.sendMessage({
        message: message,
      });

      return response.text || '';
    } catch (error: any) {
      this.logger.error(`Error in Gemini chat: ${error.message}`, error.stack);
      throw error;
    }
  }
}
