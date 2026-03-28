import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Guard que permite acesso a Super Admin (role: ADMIN) OU Club Admin do clube específico
 * Espera que o clubId esteja no parâmetro :id ou :clubId da rota
 */
@Injectable()
export class ClubAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Não autenticado');
    }

    // Super Admin tem acesso total
    if (user.role === 'ADMIN') {
      return true;
    }

    // Club Admin só tem acesso ao próprio clube
    if (user.role === 'CLUB_ADMIN') {
      const clubId = request.params.id || request.params.clubId;

      if (!clubId) {
        throw new ForbiddenException('Club ID não encontrado na rota');
      }

      if (user.clubId === clubId) {
        return true;
      }

      throw new ForbiddenException('Você não tem acesso a este clube');
    }

    throw new ForbiddenException('Acesso negado');
  }
}
