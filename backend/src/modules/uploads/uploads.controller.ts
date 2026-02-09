import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { MediaType } from '@prisma/client';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

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
}
