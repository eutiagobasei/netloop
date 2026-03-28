import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  ClubAdminLoginDto,
  ClubAdminLoginResponseDto,
  CreateClubAdminDto,
  UpdateClubAdminDto,
} from './dto';

export interface ClubAdminJwtPayload {
  sub: string; // clubAdminId
  clubId: string;
  clubName: string;
  clubSlug: string;
  role: 'CLUB_ADMIN';
  email: string;
  name: string;
}

@Injectable()
export class ClubAuthService {
  private readonly logger = new Logger(ClubAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Autentica um admin de clube e retorna o token JWT
   */
  async login(dto: ClubAdminLoginDto): Promise<ClubAdminLoginResponseDto> {
    const admin = await this.prisma.clubAdmin.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        isActive: true,
      },
      include: {
        club: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!admin.club.isActive) {
      throw new UnauthorizedException('Clube inativo');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload: ClubAdminJwtPayload = {
      sub: admin.id,
      clubId: admin.clubId,
      clubName: admin.club.name,
      clubSlug: admin.club.slug,
      role: 'CLUB_ADMIN',
      email: admin.email,
      name: admin.name,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '8h' });

    this.logger.log(`Club admin login: ${admin.email} (clube: ${admin.club.name})`);

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        clubId: admin.clubId,
        clubName: admin.club.name,
        clubSlug: admin.club.slug,
      },
    };
  }

  /**
   * Cria um novo admin para um clube (apenas Super Admin pode fazer)
   */
  async createClubAdmin(clubId: string, dto: CreateClubAdminDto) {
    // Verifica se o clube existe
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      throw new NotFoundException('Clube não encontrado');
    }

    // Verifica se já existe um admin com esse email neste clube
    const existingAdmin = await this.prisma.clubAdmin.findUnique({
      where: { clubId_email: { clubId, email: dto.email.toLowerCase() } },
    });

    if (existingAdmin) {
      throw new ConflictException('Já existe um admin com esse email neste clube');
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const admin = await this.prisma.clubAdmin.create({
      data: {
        clubId,
        email: dto.email.toLowerCase(),
        password: hashedPassword,
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        club: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    this.logger.log(`Club admin criado: ${admin.email} (clube: ${club.name})`);

    return admin;
  }

  /**
   * Lista admins de um clube
   */
  async listClubAdmins(clubId: string) {
    return this.prisma.clubAdmin.findMany({
      where: { clubId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Atualiza um admin de clube
   */
  async updateClubAdmin(clubId: string, adminId: string, dto: UpdateClubAdminDto) {
    const admin = await this.prisma.clubAdmin.findFirst({
      where: { id: adminId, clubId },
    });

    if (!admin) {
      throw new NotFoundException('Admin não encontrado');
    }

    const updateData: Record<string, any> = {};

    if (dto.name) {
      updateData.name = dto.name;
    }

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 12);
    }

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated = await this.prisma.clubAdmin.update({
      where: { id: adminId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Club admin atualizado: ${updated.email}`);

    return updated;
  }

  /**
   * Remove um admin de clube (soft delete via isActive)
   */
  async deleteClubAdmin(clubId: string, adminId: string) {
    const admin = await this.prisma.clubAdmin.findFirst({
      where: { id: adminId, clubId },
    });

    if (!admin) {
      throw new NotFoundException('Admin não encontrado');
    }

    // Verifica se é o último admin ativo do clube
    const activeAdminCount = await this.prisma.clubAdmin.count({
      where: { clubId, isActive: true },
    });

    if (activeAdminCount <= 1 && admin.isActive) {
      throw new ConflictException('Não é possível remover o último admin ativo do clube');
    }

    await this.prisma.clubAdmin.delete({
      where: { id: adminId },
    });

    this.logger.log(`Club admin removido: ${admin.email}`);

    return { message: `Admin ${admin.email} removido com sucesso` };
  }

  /**
   * Valida o token de club admin e retorna o payload
   */
  async validateClubAdminToken(token: string): Promise<ClubAdminJwtPayload | null> {
    try {
      const payload = this.jwtService.verify<ClubAdminJwtPayload>(token);
      if (payload.role !== 'CLUB_ADMIN') {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}
