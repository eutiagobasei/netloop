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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, AddMemberDto } from './dto';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar novo grupo (apenas Super Admin)' })
  @ApiResponse({ status: 201, description: 'Grupo criado com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado - apenas Super Admin' })
  @ApiResponse({ status: 409, description: 'Já existe um grupo com esse nome' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar grupos' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.groupsService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar grupo por ID (apenas membros)' })
  @ApiResponse({ status: 200, description: 'Grupo encontrado' })
  @ApiResponse({ status: 403, description: 'Acesso negado - não é membro' })
  @ApiResponse({ status: 404, description: 'Grupo não encontrado' })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.findById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar grupo (apenas admin)' })
  @ApiResponse({ status: 200, description: 'Grupo atualizado' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem atualizar' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, userId, dto);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Adicionar membro ao grupo (apenas admin)' })
  @ApiResponse({ status: 201, description: 'Membro adicionado' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem adicionar' })
  @ApiResponse({ status: 409, description: 'Usuário já é membro' })
  async addMember(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.groupsService.addMember(groupId, adminUserId, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remover membro do grupo (apenas admin)' })
  @ApiResponse({ status: 200, description: 'Membro removido' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem remover' })
  async removeMember(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groupsService.removeMember(groupId, adminUserId, userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Listar membros do grupo (apenas membros)' })
  @ApiResponse({ status: 200, description: 'Lista de membros' })
  @ApiResponse({ status: 403, description: 'Acesso negado - não é membro' })
  async getMembers(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
  ) {
    return this.groupsService.getMembers(groupId, userId);
  }

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Ver contatos agregados dos membros (apenas admin)' })
  @ApiResponse({ status: 200, description: 'Contatos agregados' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem ver contatos' })
  async getGroupContacts(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) groupId: string,
  ) {
    return this.groupsService.getGroupContacts(groupId, adminUserId);
  }
}
