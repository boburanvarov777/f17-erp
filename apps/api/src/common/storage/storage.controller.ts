import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../decorators';
import { StorageService } from './storage.service';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private storage: StorageService) {}

  /** Public read — keys are unguessable; img tags cannot send Bearer tokens. */
  @Public()
  @Get('*')
  @ApiOperation({ summary: 'Stream object from Railway bucket' })
  async getObject(@Req() req: Request, @Res() res: Response) {
    const prefix = '/api/storage/';
    const path = req.path;
    if (!path.startsWith(prefix)) throw new NotFoundException();
    const key = path.slice(prefix.length).split('/').map((s) => decodeURIComponent(s)).join('/');
    if (!key) throw new NotFoundException();

    try {
      const obj = await this.storage.getObject(key);
      if (obj.contentType) res.setHeader('Content-Type', obj.contentType);
      if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      obj.body.pipe(res);
    } catch {
      throw new NotFoundException();
    }
  }
}
