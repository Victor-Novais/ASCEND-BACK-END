import { AuditService } from './audit.service';

describe('AuditService', () => {
  const prisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService(prisma as never);
  });

  it('creates an audit log correctly', async () => {
    prisma.auditLog.create.mockResolvedValue({
      id: 1,
      action: 'CREATE',
      success: true,
    });

    await service.log({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      userEmail: 'admin@example.com',
      userRole: 'ADMIN',
      action: 'CREATE',
      entity: 'Company',
      entityId: '12',
      payload: {
        after: { id: 12 },
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entity: 'Company',
        entityId: '12',
        success: true,
      }),
    });
  });

  it('swallows logging failures in logSafe', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.logSafe({
        action: 'UPDATE',
        entity: 'Question',
      }),
    ).resolves.toBeUndefined();
  });
});
