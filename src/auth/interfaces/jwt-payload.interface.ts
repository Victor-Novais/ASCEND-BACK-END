import { Role } from '@prisma/client';

export interface JwtPayload {
  id?: string;
  sub: string;
  email: string;
  role: Role;
}
