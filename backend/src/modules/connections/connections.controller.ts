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
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { GraphData } from './types/graph.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova conexão' })
  @ApiResponse({ status: 201, description: 'Conexão criada com sucesso' })
  @ApiResponse({ status: 409, description: 'Conexão já existe' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateConnectionDto) {
    return this.connectionsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as conexões do usuário' })
  @ApiResponse({ status: 200, description: 'Lista de conexões' })
  async findAll(@CurrentUser('id') userId: string) {
    return this.connectionsService.findAll(userId);
  }

  @Get('graph')
  @ApiOperation({ summary: 'Obter dados do grafo de conexões' })
  @ApiQuery({ name: 'depth', required: false, type: Number, description: 'Profundidade do grafo (1 ou 2)' })
  @ApiResponse({ status: 200, description: 'Dados do grafo para visualização' })
  async getGraph(@CurrentUser('id') userId: string, @Query('depth') depth?: number): Promise<GraphData> {
    return this.connectionsService.getGraph(userId, depth || 2);
  }

  @Get('second-degree')
  @ApiOperation({ summary: 'Buscar contatos de 2º grau' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de contatos de 2º grau' })
  async getSecondDegree(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.connectionsService.getSecondDegreeContacts(userId, search);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar conexão' })
  @ApiResponse({ status: 200, description: 'Conexão atualizada' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.connectionsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir conexão' })
  @ApiResponse({ status: 200, description: 'Conexão excluída' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.connectionsService.delete(id, userId);
    return { message: 'Conexão excluída com sucesso' };
  }
}
