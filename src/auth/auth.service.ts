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
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
    const desiredRole = registerDto.role ?? Role.CLIENTE;

    if (desiredRole === Role.ADMIN) {
      throw new BadRequestException('Registration as ADMIN is not allowed');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.hashPassword(registerDto.password);

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
      // Garantia defensiva: `RegisterDto.name` é obrigatório.
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
