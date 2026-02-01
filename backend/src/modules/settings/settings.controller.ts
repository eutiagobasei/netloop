import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SettingCategory } from '@prisma/client';
import { SettingsService } from './settings.service';
import { CreateSettingDto } from './dto/create-setting.dto';
import { BulkUpdateSettingsDto } from './dto/bulk-update-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as configurações' })
  @ApiQuery({ name: 'category', required: false, enum: SettingCategory })
  @ApiResponse({ status: 200, description: 'Lista de configurações' })
  async findAll(@Query('category') category?: SettingCategory) {
    return this.settingsService.findAll(category);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas do sistema' })
  @ApiResponse({ status: 200, description: 'Estatísticas do sistema' })
  async getStats() {
    return this.settingsService.getStats();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Obter configuração por chave' })
  @ApiResponse({ status: 200, description: 'Dados da configuração' })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada' })
  async findByKey(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @Post()
  @ApiOperation({ summary: 'Criar ou atualizar configuração' })
  @ApiResponse({ status: 201, description: 'Configuração salva' })
  async upsert(@Body() dto: CreateSettingDto, @CurrentUser('id') userId: string) {
    return this.settingsService.upsert(dto, userId);
  }

  @Patch('bulk')
  @ApiOperation({ summary: 'Atualizar múltiplas configurações' })
  @ApiResponse({ status: 200, description: 'Configurações atualizadas' })
  async bulkUpdate(@Body() dto: BulkUpdateSettingsDto, @CurrentUser('id') userId: string) {
    return this.settingsService.bulkUpdate(dto, userId);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Remover configuração' })
  @ApiResponse({ status: 200, description: 'Configuração removida' })
  async delete(@Param('key') key: string) {
    return this.settingsService.delete(key);
  }

  @Post('evolution/test')
  @ApiOperation({ summary: 'Testar conexão com Evolution API' })
  @ApiResponse({ status: 200, description: 'Resultado do teste de conexão' })
  async testEvolutionConnection() {
    return this.settingsService.testEvolutionConnection();
  }
}
