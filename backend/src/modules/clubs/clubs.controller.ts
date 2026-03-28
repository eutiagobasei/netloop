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
import { ClubsService } from './clubs.service';
import { ClubAuthService } from './club-auth.service';
import {
  CreateClubDto,
  UpdateClubDto,
  AddMemberDto,
  AddMemberByPhoneDto,
  AddMemberByPhoneResponseDto,
  ImportInvitesDto,
  ImportInvitesResponseDto,
  CreateClubAdminDto,
  UpdateClubAdminDto,
  ClubAdminLoginDto,
  ClubAdminLoginResponseDto,
} from './dto';

@ApiTags('Clubs')
@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
    private readonly clubAuthService: ClubAuthService,
  ) {}

  // ============================================
  // CLUB ADMIN AUTH (Público)
  // ============================================

  @Post('auth/login')
  @ApiOperation({ summary: 'Login de admin do clube' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async loginClubAdmin(@Body() dto: ClubAdminLoginDto): Promise<ClubAdminLoginResponseDto> {
    return this.clubAuthService.login(dto);
  }

  // ============================================
  // CRUD BÁSICO DE CLUBES (Autenticado)
  // ============================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo clube (apenas Super Admin)' })
  @ApiResponse({ status: 201, description: 'Clube criado com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado - apenas Super Admin' })
  @ApiResponse({ status: 409, description: 'Já existe um clube com esse nome' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateClubDto) {
    return this.clubsService.create(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar clubes' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.clubsService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar clube por ID (apenas membros veem detalhes completos)' })
  @ApiResponse({ status: 200, description: 'Clube encontrado' })
  @ApiResponse({ status: 404, description: 'Clube não encontrado' })
  async findById(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.findById(id, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar clube (apenas admin do clube)' })
  @ApiResponse({ status: 200, description: 'Clube atualizado' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem atualizar' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClubDto,
  ) {
    return this.clubsService.update(id, userId, dto);
  }

  // ============================================
  // MEMBROS DO CLUBE
  // ============================================

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adicionar membro ao clube (apenas admin)' })
  @ApiResponse({ status: 201, description: 'Membro adicionado' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem adicionar' })
  @ApiResponse({ status: 409, description: 'Usuário já é membro' })
  async addMember(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.clubsService.addMember(clubId, adminUserId, dto);
  }

  @Post(':id/members/by-phone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Adicionar membro por telefone (apenas admin)',
    description:
      'Se o telefone pertence a um usuário cadastrado, adiciona direto. ' +
      'Caso contrário, cria convite e envia notificação via WhatsApp.',
  })
  @ApiResponse({
    status: 201,
    description: 'Membro adicionado ou convite criado',
    type: AddMemberByPhoneResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem adicionar' })
  @ApiResponse({ status: 409, description: 'Já é membro deste clube' })
  async addMemberByPhone(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() dto: AddMemberByPhoneDto,
  ): Promise<AddMemberByPhoneResponseDto> {
    return this.clubsService.addMemberByPhone(clubId, adminUserId, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover membro do clube (apenas admin)' })
  @ApiResponse({ status: 200, description: 'Membro removido' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem remover' })
  async removeMember(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clubsService.removeMember(clubId, adminUserId, userId);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar membros do clube (apenas membros)' })
  @ApiResponse({ status: 200, description: 'Lista de membros' })
  @ApiResponse({ status: 403, description: 'Acesso negado - não é membro' })
  async getMembers(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) clubId: string) {
    return this.clubsService.getMembers(clubId, userId);
  }

  @Get(':id/contacts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver contatos agregados dos membros (apenas admin)' })
  @ApiResponse({ status: 200, description: 'Contatos agregados' })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem ver contatos' })
  async getClubContacts(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) clubId: string,
  ) {
    return this.clubsService.getClubContacts(clubId, adminUserId);
  }

  @Post(':id/import-invites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Importar convites via planilha (apenas admin)' })
  @ApiResponse({ status: 201, description: 'Convites importados', type: ImportInvitesResponseDto })
  @ApiResponse({ status: 403, description: 'Apenas administradores podem importar' })
  async importInvites(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() dto: ImportInvitesDto,
  ): Promise<ImportInvitesResponseDto> {
    return this.clubsService.importInvites(clubId, adminUserId, dto);
  }

  // ============================================
  // ADMINS DO CLUBE (Apenas Super Admin)
  // ============================================

  @Get(':id/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar admins do clube (apenas Super Admin)' })
  @ApiResponse({ status: 200, description: 'Lista de admins' })
  async listClubAdmins(@Param('id', ParseUUIDPipe) clubId: string) {
    return this.clubAuthService.listClubAdmins(clubId);
  }

  @Post(':id/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar admin do clube (apenas Super Admin)' })
  @ApiResponse({ status: 201, description: 'Admin criado' })
  @ApiResponse({ status: 409, description: 'Já existe um admin com esse email' })
  async createClubAdmin(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() dto: CreateClubAdminDto,
  ) {
    return this.clubAuthService.createClubAdmin(clubId, dto);
  }

  @Patch(':id/admins/:adminId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar admin do clube (apenas Super Admin)' })
  @ApiResponse({ status: 200, description: 'Admin atualizado' })
  @ApiResponse({ status: 404, description: 'Admin não encontrado' })
  async updateClubAdmin(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() dto: UpdateClubAdminDto,
  ) {
    return this.clubAuthService.updateClubAdmin(clubId, adminId, dto);
  }

  @Delete(':id/admins/:adminId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover admin do clube (apenas Super Admin)' })
  @ApiResponse({ status: 200, description: 'Admin removido' })
  @ApiResponse({ status: 404, description: 'Admin não encontrado' })
  @ApiResponse({ status: 409, description: 'Não é possível remover o último admin' })
  async deleteClubAdmin(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
  ) {
    return this.clubAuthService.deleteClubAdmin(clubId, adminId);
  }
}
