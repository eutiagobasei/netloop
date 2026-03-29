import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { ClubAuthService } from './club-auth.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    WhatsappModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [ClubsController],
  providers: [ClubsService, ClubAuthService],
  exports: [ClubsService, ClubAuthService],
})
export class ClubsModule {}
