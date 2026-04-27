import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 300000 } })
  login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.login(loginDto, request);
  }

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  @Post('logout')
  logout(@Body() dto: LogoutDto, @CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub, dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
