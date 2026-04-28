import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request } from 'express';
import { AuditService } from '../../audit/audit.service';

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url, ip, headers, user } = request;
    const action = this.mapMethodToAction(method, url);

    if (!action) {
      return next.handle();
    }

    const entity = this.mapUrlToEntity(url);
    const entityId = this.extractEntityId(url);

    return next.handle().pipe(
      tap(() => {
        void this.auditService.log({
          userId: user?.id,
          userEmail: user?.email,
          userRole: user?.role,
          action,
          entity,
          entityId,
          ipAddress: ip,
          userAgent: this.getUserAgent(headers['user-agent']),
          success: true,
        });
      }),
      catchError((err: unknown) => {
        void this.auditService.log({
          userId: user?.id,
          userEmail: user?.email,
          userRole: user?.role,
          action,
          entity,
          entityId,
          ipAddress: ip,
          userAgent: this.getUserAgent(headers['user-agent']),
          success: false,
          errorMsg: err instanceof Error ? err.message?.substring(0, 200) : undefined,
        });

        return throwError(() => err);
      }),
    );
  }

  private mapMethodToAction(method: string, url: string): string | null {
    const normalizedMethod = method.toUpperCase();

    if (normalizedMethod === 'POST') {
      return 'CREATE';
    }

    if (normalizedMethod === 'PATCH' || normalizedMethod === 'PUT') {
      return 'UPDATE';
    }

    if (normalizedMethod === 'DELETE') {
      return 'DELETE';
    }

    if (normalizedMethod === 'GET') {
      return this.extractEntityId(url) ? 'READ' : null;
    }

    return null;
  }

  private mapUrlToEntity(url: string): string | undefined {
    const path = this.normalizePath(url);
    const map: Record<string, string> = {
      '/users': 'User',
      '/companies': 'Company',
      '/questions': 'Question',
      '/assessments': 'Assessment',
      '/action-plans': 'ActionPlan',
      '/auth': 'Auth',
      '/audit-logs': 'AuditLog',
      '/risks': 'Risk',
      '/analytics': 'Analytics',
    };

    return Object.entries(map).find(([prefix]) => path.startsWith(prefix))?.[1];
  }

  private extractEntityId(url: string): string | undefined {
    const path = this.normalizePath(url);
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    if (!lastSegment) {
      return undefined;
    }

    if (/^\d+$/.test(lastSegment)) {
      return lastSegment;
    }

    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        lastSegment,
      )
    ) {
      return lastSegment;
    }

    return undefined;
  }

  private normalizePath(url: string): string {
    return url.split('?')[0].toLowerCase();
  }

  private getUserAgent(userAgentHeader: string | string[] | undefined): string | undefined {
    if (typeof userAgentHeader === 'string') {
      return userAgentHeader.substring(0, 200);
    }

    if (Array.isArray(userAgentHeader)) {
      return userAgentHeader.join(', ').substring(0, 200);
    }

    return undefined;
  }
}
