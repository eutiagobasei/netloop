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
import { TagType } from '@prisma/client';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova tag' })
  @ApiResponse({ status: 201, description: 'Tag criada com sucesso' })
  @ApiResponse({ status: 409, description: 'Tag já existe' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateTagDto) {
    return this.tagsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tags do usuário' })
  @ApiQuery({ name: 'type', enum: TagType, required: false })
  @ApiResponse({ status: 200, description: 'Lista de tags' })
  async findAll(@CurrentUser('id') userId: string, @Query('type') type?: TagType) {
    return this.tagsService.findAll(userId, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter tag por ID' })
  @ApiResponse({ status: 200, description: 'Dados da tag' })
  @ApiResponse({ status: 404, description: 'Tag não encontrada' })
  async findOne(@Param('id') id: string) {
    return this.tagsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar tag' })
  @ApiResponse({ status: 200, description: 'Tag atualizada' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir tag' })
  @ApiResponse({ status: 200, description: 'Tag excluída' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.tagsService.delete(id, userId);
    return { message: 'Tag excluída com sucesso' };
  }
}
