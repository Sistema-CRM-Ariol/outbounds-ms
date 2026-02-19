import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { envs } from './config';

async function bootstrap() {
    const logger = new Logger('Outbounds MS');

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        AppModule,
        {
            transport: Transport.NATS,
            options: {
                servers: envs.natsServers,
                name: "Outbounds Microservice"
            }
        }
    );

    await app.listen();

    logger.log(`Outbounds Microservice running on NATS server: ${envs.natsServers}`);
}
bootstrap();
