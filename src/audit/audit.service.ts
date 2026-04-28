import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditLogPayload = {
  before?: unknown;
  after?: unknown;
};

export type AuditLogInput = {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  entity?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  payload?: AuditLogPayload;
  success?: boolean;
  errorMsg?: string;
};

type FindAuditLogsParams = {
  userId?: string;
  entity?: string;
  action?: string;
  success?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  page?: number;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: AuditLogInput) {
    try {
      await this.prisma.auditLog.create({
        data: {
          ...data,
          payload: data.payload as Prisma.InputJsonValue | undefined,
          success: data.success ?? true,
        },
      });
    } catch {
      // log de auditoria nunca deve quebrar a requisição principal
    }
  }

  async logSafe(data: AuditLogInput): Promise<void> {
    await this.log(data);
  }

  async findAll(params: FindAuditLogsParams) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const where = this.buildWhere(params);

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getStats() {
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const where = {
      createdAt: {
        gte: dateFrom,
      },
    } satisfies Prisma.AuditLogWhereInput;

    const [totalActions, failedActions, uniqueUserRows, topEntities, topActions] =
      await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.count({ where: { ...where, success: false } }),
        this.prisma.auditLog.findMany({
          where: { ...where, userId: { not: null } },
          distinct: ['userId'],
          select: { userId: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['entity'],
          where: {
            ...where,
            entity: { not: null },
          },
          _count: { _all: true },
          orderBy: {
            _count: {
              entity: 'desc',
            },
          },
          take: 5,
        }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: { _all: true },
          orderBy: {
            _count: {
              action: 'desc',
            },
          },
          take: 5,
        }),
      ]);

    return {
      totalActions,
      failedActions,
      uniqueUsers: uniqueUserRows.length,
      topEntities: topEntities.map((item) => ({
        entity: item.entity,
        count: item._count._all,
      })),
      topActions: topActions.map((item) => ({
        action: item.action,
        count: item._count._all,
      })),
    };
  }

  async exportCsv(params: { dateFrom: string; dateTo: string; entity?: string }) {
    const where = this.buildWhere(params);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const header = [
      'id',
      'userId',
      'userEmail',
      'userRole',
      'action',
      'entity',
      'entityId',
      'ipAddress',
      'success',
      'errorMsg',
      'createdAt',
    ];

    const lines = rows.map((row) =>
      [
        row.id,
        row.userId ?? '',
        row.userEmail ?? '',
        row.userRole ?? '',
        row.action,
        row.entity ?? '',
        row.entityId ?? '',
        row.ipAddress ?? '',
        row.success,
        row.errorMsg ?? '',
        row.createdAt.toISOString(),
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
  }

  private buildWhere(params: {
    userId?: string;
    entity?: string;
    action?: string;
    success?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }): Prisma.AuditLogWhereInput {
    return {
      userId: params.userId,
      entity: params.entity,
      action: params.action,
      success: params.success,
      createdAt:
        params.dateFrom || params.dateTo
          ? {
              gte: params.dateFrom ? new Date(params.dateFrom) : undefined,
              lte: params.dateTo ? new Date(params.dateTo) : undefined,
            }
          : undefined,
    };
  }

  private escapeCsv(value: unknown): string {
    const stringValue = String(value ?? '');
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
