import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { AuditService } from '../audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';

describe('AuthController Security', () => {
  let app: any;
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
  };
  const auditService = {
    logSafe: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 10 },
          { name: 'medium', ttl: 60000, limit: 100 },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuditService, useValue: auditService },
        RolesGuard,
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 429 on the 6th login attempt', async () => {
    authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

    for (let attempt = 1; attempt <= 5; attempt++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'Password1!' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'Password1!' })
      .expect(429);
  });
});
