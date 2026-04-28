import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterUserType } from './dto/register-user-type.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly companiesService: CompaniesService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    loginDto: LoginDto,
    request?: Request,
  ): Promise<TokenPair> {
    try {
      const user = await this.validateUserCredentials(loginDto.email, loginDto.password);
      const tokens = await this.issueTokenPair(user);

      await this.auditService.log({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN',
        entity: 'Auth',
        success: true,
      });

      return tokens;
    } catch (error) {
      await this.auditService.log({
        userEmail: loginDto.email,
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        success: false,
        errorMsg: 'Credenciais inválidas',
      });
      throw error;
    }
  }

  async register(registerDto: RegisterDto): Promise<{
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
  }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.hashPassword(registerDto.password);

    const userType = registerDto.userType;

    if (userType === RegisterUserType.COLLABORATOR) {
      if (!registerDto.companyCode?.trim()) {
        throw new BadRequestException('companyCode is required for COLLABORATOR');
      }
      const company = await this.companiesService.findCompanyByCode(registerDto.companyCode);
      if (!company) {
        throw new BadRequestException('Invalid company code');
      }

      const createdUser = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          name: registerDto.name,
          email: registerDto.email,
          passwordHash,
          role: Role.COLLABORATOR,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      await this.prisma.userCompanyAssignment.create({
        data: {
          userId: createdUser.id,
          companyId: company.id,
        },
      });

      return this.buildRegisterResponse(createdUser);
    }

    if (userType === RegisterUserType.CLIENTE) {
      const createdUser = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          name: registerDto.name,
          email: registerDto.email,
          passwordHash,
          role: Role.CLIENTE,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      if (registerDto.company) {
        await this.companiesService.createCompanyForNewOwner(createdUser.id, registerDto.company);
      }

      return this.buildRegisterResponse(createdUser);
    }

    const desiredRole = registerDto.role ?? Role.CLIENTE;

    if (desiredRole === Role.ADMIN) {
      throw new BadRequestException('Registration as ADMIN is not allowed');
    }

    if (desiredRole === Role.COLLABORATOR) {
      throw new BadRequestException(
        'COLLABORATOR registration requires userType COLLABORATOR and a valid companyCode',
      );
    }

    const createdUser = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        name: registerDto.name,
        email: registerDto.email,
        passwordHash,
        role: desiredRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!createdUser.name) {
      throw new BadRequestException('Invalid user name');
    }

    return this.buildRegisterResponse(createdUser);
  }

  private async buildRegisterResponse(createdUser: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    createdAt: Date;
  }): Promise<{
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
  }> {
    if (!createdUser.name) {
      throw new BadRequestException('Invalid user name');
    }

    const tokens = await this.issueTokenPair({
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    });

    return {
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        createdAt: createdUser.createdAt,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!storedToken || storedToken.revoked) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.getRefreshSecret(),
      });
      if (payload.sub !== storedToken.userId) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { revoked: true },
    });

    return this.issueTokenPair(storedToken.user);
  }

  async logout(userId: string, refreshToken: string): Promise<{ message: string }> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      select: {
        token: true,
        userId: true,
        revoked: true,
      },
    });

    if (!storedToken || storedToken.userId !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!storedToken.revoked) {
      await this.prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }

    await this.auditService.log({
      userId,
      action: 'LOGOUT',
      entity: 'Auth',
      entityId: userId,
    });

    return { message: 'Logout realizado com sucesso' };
  }

  async hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, 12);
  }

  async getProfile(userId: string): Promise<{
    id: string;
    name: string | null;
    email: string;
    role: Role;
    createdAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async validateUserCredentials(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private extractIp(request?: Request): string | undefined {
    if (!request) {
      return undefined;
    }

    return request.ip || request.socket?.remoteAddress || undefined;
  }

  private async issueTokenPair(user: AuthUser): Promise<TokenPair> {
    const payload: JwtPayload = {
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: this.getAccessExpiry() as any,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: this.getRefreshExpiry() as any,
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + this.durationToMs(this.getRefreshExpiry())),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }

  private getAccessExpiry(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  private getRefreshExpiry(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  private durationToMs(value: string): number {
    const normalized = value.trim();
    const match = normalized.match(/^(\d+)([smhd])$/i);

    if (!match) {
      const seconds = Number(normalized);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
      throw new Error(`Unsupported duration format: ${value}`);
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return amount * multipliers[unit];
  }
}
