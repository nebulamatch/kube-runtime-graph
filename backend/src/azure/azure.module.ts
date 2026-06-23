import { Module } from '@nestjs/common';
import { AzureService } from './azure.service';
import { AzureController } from './azure.controller';

@Module({
  controllers: [AzureController],
  providers: [AzureService],
})
export class AzureModule {}
