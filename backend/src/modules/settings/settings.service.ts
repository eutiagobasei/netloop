import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { SettingCategory, SystemSetting } from '@prisma/client';
import { CreateSettingDto } from './dto/create-setting.dto';
import { BulkUpdateSettingsDto } from './dto/bulk-update-settings.dto';
import { EncryptionUtil } from './utils/encryption.util';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.configService.get<string>(
      'SETTINGS_ENCRYPTION_KEY',
      'default-encryption-key-32chars!',
    );
  }

  async findAll(category?: SettingCategory) {
    const settings = await this.prisma.systemSetting.findMany({
      where: category ? { category } : undefined,
      orderBy: { key: 'asc' },
    });

    return settings.map((setting) => this.formatSettingResponse(setting));
  }

  async findByKey(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting ${key} não encontrada`);
    }

    return this.formatSettingResponse(setting);
  }

  async getDecryptedValue(key: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) return null;

    if (setting.isEncrypted) {
      return EncryptionUtil.decrypt(setting.value, this.encryptionKey);
    }

    return setting.value;
  }

  async upsert(dto: CreateSettingDto, userId: string) {
    const value = dto.isEncrypted
      ? EncryptionUtil.encrypt(dto.value, this.encryptionKey)
      : dto.value;

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: dto.key },
      create: {
        key: dto.key,
        value,
        category: dto.category,
        isEncrypted: dto.isEncrypted ?? false,
        description: dto.description,
        updatedById: userId,
      },
      update: {
        value,
        category: dto.category,
        isEncrypted: dto.isEncrypted ?? false,
        description: dto.description,
        updatedById: userId,
      },
    });

    return this.formatSettingResponse(setting);
  }

  async bulkUpdate(dto: BulkUpdateSettingsDto, userId: string) {
    const results = await Promise.all(
      dto.settings
        .filter((item) => item.value)
        .map(async (item) => {
          const existing = await this.prisma.systemSetting.findUnique({
            where: { key: item.key },
          });

          if (!existing) return null;

          const value = existing.isEncrypted
            ? EncryptionUtil.encrypt(item.value!, this.encryptionKey)
            : item.value!;

          return this.prisma.systemSetting.update({
            where: { key: item.key },
            data: { value, updatedById: userId },
          });
        }),
    );

    return results.filter(Boolean).map((s) => this.formatSettingResponse(s!));
  }

  async delete(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting ${key} não encontrada`);
    }

    await this.prisma.systemSetting.delete({
      where: { key },
    });

    return { message: 'Configuração removida com sucesso' };
  }

  async testEvolutionConnection(): Promise<{ success: boolean; message: string }> {
    const apiUrl = await this.getDecryptedValue('evolution_api_url');
    const apiKey = await this.getDecryptedValue('evolution_api_key');
    const instanceName = await this.getDecryptedValue('evolution_instance_name');

    if (!apiUrl || !apiKey) {
      return {
        success: false,
        message: 'URL ou API Key da Evolution não configuradas',
      };
    }

    try {
      const response = await fetch(`${apiUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          apikey: apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Lista todas as instâncias disponíveis (suporta ambos formatos de resposta)
        const availableInstances = Array.isArray(data)
          ? data.map((i: { name?: string; instance?: { instanceName?: string } }) =>
              i?.name || i?.instance?.instanceName
            ).filter(Boolean)
          : [];

        if (availableInstances.length === 0) {
          return {
            success: false,
            message: 'Nenhuma instância encontrada na Evolution API. Crie uma instância primeiro.',
          };
        }

        const instance = instanceName
          ? data.find((i: { name?: string; instance?: { instanceName?: string } }) =>
              (i.name?.toLowerCase() === instanceName.toLowerCase()) ||
              (i.instance?.instanceName?.toLowerCase() === instanceName.toLowerCase()))
          : data[0];

        if (instance) {
          const foundName = instance.name || instance.instance?.instanceName;
          return {
            success: true,
            message: `Conectado com sucesso. Instância: ${foundName}`,
          };
        }

        return {
          success: false,
          message: `Instância "${instanceName}" não encontrada. Instâncias disponíveis: ${availableInstances.join(', ')}`,
        };
      }

      return {
        success: false,
        message: `Erro na conexão: ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro ao conectar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  async getStats() {
    const [totalUsers, totalContacts, totalMessages, totalConnections] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.contact.count(),
      this.prisma.whatsappMessage.count(),
      this.prisma.connection.count(),
    ]);

    return {
      totalUsers,
      totalContacts,
      totalMessages,
      totalConnections,
    };
  }

  private formatSettingResponse(setting: SystemSetting) {
    let displayValue = setting.value;

    if (setting.isEncrypted) {
      try {
        const decrypted = EncryptionUtil.decrypt(setting.value, this.encryptionKey);
        displayValue = EncryptionUtil.maskValue(decrypted);
      } catch {
        displayValue = '****';
      }
    }

    return {
      id: setting.id,
      key: setting.key,
      value: displayValue,
      category: setting.category,
      isEncrypted: setting.isEncrypted,
      description: setting.description,
      updatedAt: setting.updatedAt,
    };
  }
}
