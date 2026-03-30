import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const passwordHash = await bcrypt.hash(createUserDto.password, 12);

      return await this.prisma.user.create({
        data: {
          id: createUserDto.id ?? randomUUID(),
          name: createUserDto.name,
          email: createUserDto.email,
          passwordHash,
          role: createUserDto.role,
        },
      });
    } catch (error: unknown) {
      this.handlePrismaError(error);
    }
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id '${id}' not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.ensureUserExists(id);

    try {
      const passwordHash = updateUserDto.password
        ? await bcrypt.hash(updateUserDto.password, 12)
        : undefined;

      return await this.prisma.user.update({
        where: { id },
        data: {
          name: updateUserDto.name,
          email: updateUserDto.email,
          passwordHash,
          role: updateUserDto.role,
        },
      });
    } catch (error: unknown) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string): Promise<User> {
    await this.ensureUserExists(id);

    return this.prisma.user.delete({ where: { id } });
  }

  private async ensureUserExists(id: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`User with id '${id}' not found`);
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A user with this email already exists');
    }

    throw error;
  }
}
