import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GraphModule } from './graph/graph.module';
import { AzureModule } from './azure/azure.module';

@Module({
  imports: [GraphModule, AzureModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
