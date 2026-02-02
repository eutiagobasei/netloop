import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Normaliza número de telefone brasileiro
   * Adiciona o 9º dígito se necessário
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');

    // Se começa com 55 (Brasil) e tem 12 dígitos (sem o 9º dígito)
    if (cleaned.startsWith('55') && cleaned.length === 12) {
      // Formato: 55 + DDD(2) + número(8) = 12 dígitos
      // Precisa adicionar o 9: 55 + DDD(2) + 9 + número(8) = 13 dígitos
      const ddd = cleaned.substring(2, 4);
      const number = cleaned.substring(4);

      // Só adiciona 9 se for celular (começa com 6, 7, 8 ou 9)
      if (['6', '7', '8', '9'].includes(number[0])) {
        cleaned = `55${ddd}9${number}`;
      }
    }

    return cleaned;
  }

  async findByPhone(phone: string) {
    const normalizedPhone = this.normalizePhoneNumber(phone);

    // Tenta com o número normalizado (com 9º dígito)
    let user = await this.prisma.user.findFirst({
      where: { phone: normalizedPhone },
    });

    // Se não encontrou, tenta com o número original
    if (!user) {
      user = await this.prisma.user.findFirst({
        where: { phone: phone.replace(/\D/g, '') },
      });
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deactivate(id: string) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
