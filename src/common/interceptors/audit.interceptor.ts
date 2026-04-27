import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request } from 'express';
import { AuditService } from '../../audit/audit.service';

type RequestUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const meta = this.extractRequestMetadata(request);

    if (!meta.shouldLog) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody) => {
        void this.auditService.logSafe({
          userId: request.user?.id ?? request.user?.sub,
          userEmail: request.user?.email,
          userRole: request.user?.role,
          action: meta.action!,
          entity: meta.entity,
          entityId: meta.entityId,
          ipAddress: request.ip || request.socket?.remoteAddress || undefined,
          userAgent: request.headers['user-agent'],
          payload: meta.action === 'UPDATE' ? { after: responseBody } : undefined,
          success: true,
        });
      }),
      catchError((error) => {
        void this.auditService.logSafe({
          userId: request.user?.id ?? request.user?.sub,
          userEmail: request.user?.email,
          userRole: request.user?.role,
          action: meta.action ?? 'UNKNOWN',
          entity: meta.entity,
          entityId: meta.entityId,
          ipAddress: request.ip || request.socket?.remoteAddress || undefined,
          userAgent: request.headers['user-agent'],
          success: false,
          errorMsg: error instanceof Error ? error.message : 'Unknown error',
        });

        return throwError(() => error);
      }),
    );
  }

  private extractRequestMetadata(request: Request) {
    const normalizedPath = (request.route?.path
      ? `${request.baseUrl || ''}${request.route.path}`
      : request.originalUrl.split('?')[0]
    ).toLowerCase();
    const method = request.method.toUpperCase();
    const entity = this.resolveEntity(normalizedPath);
    const entityId = this.extractEntityId(request.originalUrl.split('?')[0]);

    if (!entity) {
      return { shouldLog: false };
    }

    if (method === 'GET' && !entityId) {
      return { shouldLog: false };
    }

    return {
      shouldLog: true,
      action: this.resolveAction(method),
      entity,
      entityId,
    };
  }

  private resolveAction(method: string): string {
    switch (method) {
      case 'POST':
        return 'CREATE';
      case 'PATCH':
      case 'PUT':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      case 'GET':
        return 'READ';
      default:
        return method;
    }
  }

  private resolveEntity(path: string): string | undefined {
    const map: Record<string, string> = {
      '/users': 'User',
      '/companies': 'Company',
      '/questions': 'Question',
      '/assessments': 'Assessment',
      '/action-plans': 'ActionPlan',
      '/audit-logs': 'AuditLog',
    };

    return Object.entries(map).find(([prefix]) => path.startsWith(prefix))?.[1];
  }

  private extractEntityId(path: string): string | undefined {
    const segments = path.split('/').filter(Boolean).reverse();
    return segments.find((segment) =>
      /^\d+$/.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment),
    );
  }
}
