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
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ExtractTextDto } from './dto/extract-text.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AIService } from '../ai/ai.service';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => AIService))
    private readonly aiService: AIService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo contato' })
  @ApiResponse({ status: 201, description: 'Contato criado com sucesso' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateContactDto) {
    return this.contactsService.create(userId, dto);
  }

  @Post('extract')
  @ApiOperation({
    summary: 'Extrair dados de texto e criar/atualizar contato',
    description: 'Recebe texto livre, extrai informações de contato via IA e salva (com merge se existir)',
  })
  @ApiResponse({ status: 201, description: 'Contato criado/atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Texto inválido ou extração falhou' })
  async extractAndSave(
    @CurrentUser('id') userId: string,
    @Body() dto: ExtractTextDto,
  ) {
    const extraction = await this.aiService.extractWithConnections(dto.text);

    if (!extraction.success) {
      throw new Error('Falha na extração de dados');
    }

    return this.contactsService.upsertFromExtraction(userId, extraction);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Busca inteligente em 2 níveis',
    description: 'Busca primeiro em contatos diretos, depois em conexões mencionadas (ponte)',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Texto para busca' })
  @ApiResponse({
    status: 200,
    description: 'Resultado da busca com tipo (direto/ponte/nenhum) e mensagem formatada',
  })
  async search(
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
  ) {
    if (!query || query.trim().length < 2) {
      return { type: 'nenhum', data: [], message: 'Digite ao menos 2 caracteres para buscar.' };
    }
    return this.contactsService.search(userId, query.trim());
  }

  @Get()
  @ApiOperation({ summary: 'Listar contatos do usuário' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de contatos' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.contactsService.findAll(userId, page || 1, limit || 20, search);
  }

  @Get('search/semantic')
  @ApiOperation({ summary: 'Busca semântica de contatos' })
  @ApiQuery({ name: 'q', required: true, description: 'Texto para busca semântica' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Contatos encontrados por similaridade' })
  async searchSemantic(
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.contactsService.searchSemantic(userId, query, limit || 10);
  }

  @Post('embeddings/regenerate')
  @ApiOperation({ summary: 'Regenerar embeddings de todos os contatos' })
  @ApiResponse({ status: 200, description: 'Embeddings regenerados' })
  async regenerateEmbeddings(@CurrentUser('id') userId: string) {
    return this.contactsService.regenerateAllEmbeddings(userId);
  }

  @Get('by-tag/:tagId')
  @ApiOperation({ summary: 'Listar contatos por tag' })
  @ApiResponse({ status: 200, description: 'Lista de contatos com a tag' })
  async findByTag(@CurrentUser('id') userId: string, @Param('tagId') tagId: string) {
    return this.contactsService.findByTag(userId, tagId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter contato por ID' })
  @ApiResponse({ status: 200, description: 'Dados do contato' })
  @ApiResponse({ status: 404, description: 'Contato não encontrado' })
  async findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.contactsService.findById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar contato' })
  @ApiResponse({ status: 200, description: 'Contato atualizado' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir contato' })
  @ApiResponse({ status: 200, description: 'Contato excluído' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.contactsService.delete(id, userId);
    return { message: 'Contato excluído com sucesso' };
  }
}
