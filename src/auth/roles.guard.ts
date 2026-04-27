import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ROLES_KEY } from './roles.decorator';

type RequestUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: Role;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const userRole = request.user?.role;

    if (!userRole) {
      void this.auditService.logSafe({
        userId: request.user?.id ?? request.user?.sub,
        userEmail: request.user?.email,
        userRole: request.user?.role,
        action: 'ACCESS_DENIED',
        entity: request['route']?.path ?? request['originalUrl'],
        entityId: undefined,
        ipAddress: request['ip'],
        userAgent: request['headers']?.['user-agent'],
        success: false,
        errorMsg: 'User role is missing in token payload',
      });
      throw new ForbiddenException('User role is missing in token payload');
    }

    const hasAccess = requiredRoles.includes(userRole);

    if (!hasAccess) {
      void this.auditService.logSafe({
        userId: request.user?.id ?? request.user?.sub,
        userEmail: request.user?.email,
        userRole: request.user?.role,
        action: 'ACCESS_DENIED',
        entity: request['route']?.path ?? request['originalUrl'],
        entityId: undefined,
        ipAddress: request['ip'],
        userAgent: request['headers']?.['user-agent'],
        success: false,
        errorMsg: 'Insufficient role permissions',
      });
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
