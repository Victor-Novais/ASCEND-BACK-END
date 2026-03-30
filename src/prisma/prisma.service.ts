import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    const clientWithOn = this as unknown as {
      $on: (
        eventType: 'beforeExit',
        callback: () => void | Promise<void>,
      ) => void;
    };

    clientWithOn.$on('beforeExit', () => {
      void app.close();
    });
  }
}
