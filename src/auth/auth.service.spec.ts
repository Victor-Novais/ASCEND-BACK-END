import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService Refresh Tokens', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const companiesService = {
    findCompanyByCode: jest.fn(),
    createCompanyForNewOwner: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'access-secret-12345678901234567890',
        JWT_REFRESH_SECRET: 'refresh-secret-12345678901234567890',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return values[key];
    }),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwtService as never,
      companiesService as never,
      auditService as never,
      configService as never,
    );
  });

  it('returns a new token pair when refresh token is valid', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 10,
      token: 'old-refresh',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        role: Role.CLIENTE,
      },
    });
    jwtService.verifyAsync.mockResolvedValue({
      sub: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      role: Role.CLIENTE,
    });
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.refreshAccessToken('old-refresh');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { revoked: true },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: 'new-refresh-token',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
  });

  it('rejects revoked refresh tokens', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 10,
      token: 'revoked-token',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAt: new Date(Date.now() + 60_000),
      revoked: true,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        role: Role.CLIENTE,
      },
    });

    await expect(service.refreshAccessToken('revoked-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
