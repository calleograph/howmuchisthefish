import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { EventsService } from './events.service';
import { TrackEventDto } from './dto/track-event.dto';

/**
 * Публичные (без JWT) роуты, встроенные в письма/учебные страницы. Префикс /t
 * отдельный от /api, чтобы не путать с авторизованным REST API.
 */
@ApiTags('tracking')
@Public()
@Controller('t')
export class TrackingController {
  constructor(private readonly events: EventsService) {}

  // Трекинг-пиксель открытия письма: <img src=".../t/pixel.gif?token=...">
  @Get('pixel.gif')
  @Header('Cache-Control', 'no-store')
  async pixel(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (token) {
      await this.events.record({
        token,
        type: 'email_opened',
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
    }
    const gif = await this.events.getTrackingPixel();
    res.set('Content-Type', 'image/gif');
    res.send(gif);
  }

  // Вызывается safe-form-injector.ts со страницы: link_clicked при загрузке,
  // form_submitted при отправке формы (без полей формы — см. TrackEventDto).
  @Post('event')
  @Header('Cache-Control', 'no-store')
  async event(@Body() dto: TrackEventDto, @Req() req: Request) {
    return this.events.record({
      token: dto.token,
      type: dto.type,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }
}
