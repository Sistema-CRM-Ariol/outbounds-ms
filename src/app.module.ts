import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { OutboundsModule } from './outbounds/outbounds.module';

@Module({
    imports: [PrismaModule, OutboundsModule],
})
export class AppModule { }
