import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { MediaType } from '@prisma/client';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('welcome-audio')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de áudio de boas-vindas' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Áudio enviado com sucesso' })
  async uploadWelcomeAudio(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório');
    }
    return this.uploadsService.uploadMedia(file, 'AUDIO', 'welcome_audio_path', userId);
  }

  @Post('welcome-video')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de vídeo de boas-vindas' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Vídeo enviado com sucesso' })
  async uploadWelcomeVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório');
    }
    return this.uploadsService.uploadMedia(file, 'VIDEO', 'welcome_video_path', userId);
  }

  @Delete('welcome-audio')
  @ApiOperation({ summary: 'Remover áudio de boas-vindas' })
  @ApiResponse({ status: 200, description: 'Áudio removido' })
  async deleteWelcomeAudio() {
    return this.uploadsService.deleteBySettingKey('welcome_audio_path');
  }

  @Delete('welcome-video')
  @ApiOperation({ summary: 'Remover vídeo de boas-vindas' })
  @ApiResponse({ status: 200, description: 'Vídeo removido' })
  async deleteWelcomeVideo() {
    return this.uploadsService.deleteBySettingKey('welcome_video_path');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover arquivo de mídia por ID' })
  @ApiResponse({ status: 200, description: 'Arquivo removido' })
  async deleteMedia(@Param('id') id: string) {
    return this.uploadsService.deleteMedia(id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar arquivos de mídia' })
  @ApiResponse({ status: 200, description: 'Lista de arquivos' })
  async listMedia(@Query('type') type?: MediaType) {
    return this.uploadsService.listByType(type);
  }

  @Get('welcome')
  @ApiOperation({ summary: 'Obter mídia de boas-vindas configuradas' })
  @ApiResponse({ status: 200, description: 'Mídias de boas-vindas' })
  async getWelcomeMedia() {
    const audio = await this.uploadsService.getBySettingKey('welcome_audio_path');
    const video = await this.uploadsService.getBySettingKey('welcome_video_path');

    return {
      audio: audio
        ? { id: audio.id, filename: audio.filename, size: audio.size }
        : null,
      video: video
        ? { id: video.id, filename: video.filename, size: video.size }
        : null,
    };
  }
}
