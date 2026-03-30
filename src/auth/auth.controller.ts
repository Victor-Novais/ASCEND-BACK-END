import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(
    @CurrentUser() user: JwtPayload,
  ): { id: string; email: string; role: Role } {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
    };
  }
}
