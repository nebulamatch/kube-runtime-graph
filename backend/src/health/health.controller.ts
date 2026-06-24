import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get('live')
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  readiness() {
    return { status: 'ok' };
  }
}
