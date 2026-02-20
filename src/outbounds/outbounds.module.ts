import { Module } from '@nestjs/common';
import { OutboundsService } from './outbounds.service';
import { OutboundsController } from './outbounds.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NatsModule } from 'src/transports/nats.module';

@Module({
    controllers: [OutboundsController],
    providers: [OutboundsService],
    imports: [PrismaModule, NatsModule],
})
export class OutboundsModule { }
