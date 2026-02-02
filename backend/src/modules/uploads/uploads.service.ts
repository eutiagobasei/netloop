import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');

    // Garante que diretório existe
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Faz upload de arquivo de mídia
   */
  async uploadMedia(
    file: Express.Multer.File,
    type: MediaType,
    settingKey: string,
    userId: string,
  ) {
    // Valida tipo de arquivo
    this.validateFile(file, type);

    // Remove upload anterior se existir
    const existingUpload = await this.prisma.mediaUpload.findFirst({
      where: { settingKey },
    });

    if (existingUpload) {
      // Remove arquivo físico anterior
      if (fs.existsSync(existingUpload.path)) {
        fs.unlinkSync(existingUpload.path);
      }
      // Remove registro anterior
      await this.prisma.mediaUpload.delete({
        where: { id: existingUpload.id },
      });
    }

    // Gera nome único
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(this.uploadDir, filename);

    // Salva arquivo
    fs.writeFileSync(filePath, file.buffer);

    // Salva no banco
    const upload = await this.prisma.mediaUpload.create({
      data: {
        filename: file.originalname,
        path: filePath,
        mimeType: file.mimetype,
        size: file.size,
        type,
        settingKey,
        uploadedById: userId,
      },
    });

    // Atualiza setting com o caminho
    await this.prisma.systemSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: filePath,
        category: 'WHATSAPP',
        isEncrypted: false,
        description: `Caminho do arquivo de ${type.toLowerCase()} de boas-vindas`,
        updatedById: userId,
      },
      update: {
        value: filePath,
        updatedById: userId,
      },
    });

    this.logger.log(`Upload concluído: ${filename} (${settingKey})`);

    return {
      id: upload.id,
      filename: upload.filename,
      path: upload.path,
      type: upload.type,
      size: upload.size,
    };
  }

  /**
   * Remove arquivo de mídia
   */
  async deleteMedia(id: string) {
    const upload = await this.prisma.mediaUpload.findUnique({
      where: { id },
    });

    if (!upload) {
      throw new BadRequestException('Arquivo não encontrado');
    }

    // Remove arquivo físico
    if (fs.existsSync(upload.path)) {
      fs.unlinkSync(upload.path);
    }

    // Remove do banco
    await this.prisma.mediaUpload.delete({
      where: { id },
    });

    // Limpa setting se associada
    if (upload.settingKey) {
      await this.prisma.systemSetting.deleteMany({
        where: { key: upload.settingKey },
      });
    }

    this.logger.log(`Arquivo removido: ${upload.filename}`);

    return { message: 'Arquivo removido com sucesso' };
  }

  /**
   * Remove mídia por settingKey
   */
  async deleteBySettingKey(settingKey: string) {
    const upload = await this.prisma.mediaUpload.findFirst({
      where: { settingKey },
    });

    if (upload) {
      return this.deleteMedia(upload.id);
    }

    return { message: 'Nenhum arquivo encontrado' };
  }

  /**
   * Lista uploads por tipo
   */
  async listByType(type?: MediaType) {
    return this.prisma.mediaUpload.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtém upload por settingKey
   */
  async getBySettingKey(settingKey: string) {
    return this.prisma.mediaUpload.findFirst({
      where: { settingKey },
    });
  }

  private validateFile(file: Express.Multer.File, type: MediaType) {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Arquivo muito grande (max 50MB)');
    }

    const allowedMimes = type === 'AUDIO' ? ALLOWED_AUDIO_MIMES : ALLOWED_VIDEO_MIMES;

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo inválido. Permitidos: ${allowedMimes.join(', ')}`,
      );
    }
  }
}
