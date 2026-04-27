import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto password policy', () => {
  it('rejects weak password abc123', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: 'User Example',
      email: 'user@example.com',
      password: 'abc123',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
