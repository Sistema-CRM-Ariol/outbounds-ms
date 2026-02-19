
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private logger = new Logger('Expenses Database');

    async onModuleInit() {
        try {
            this.logger.log('Connecting to database');
            await this.$connect();
            this.logger.log('Connected to database');
        } catch (error) {
            if (error.errorCode == "P1001") {
                this.logger.error('Error connecting to database');
            }
        }
    }
}