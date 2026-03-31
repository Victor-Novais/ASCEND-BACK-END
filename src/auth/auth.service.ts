import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly companiesService: CompaniesService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.validateUserCredentials(loginDto.email, loginDto.password);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken };
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
  }> {
    if (!createdUser.name) {
      throw new BadRequestException('Invalid user name');
    }

    const payload: JwtPayload = {
      sub: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        createdAt: createdUser.createdAt,
      },
      accessToken,
    };
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
}
