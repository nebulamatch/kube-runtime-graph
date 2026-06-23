import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GraphService } from './graph.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GraphGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly graphService: GraphService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    // Initial connection doesn't have namespace context yet.
    // The client will emit 'requestUpdate' with context/namespace.
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    if (this.server.sockets.sockets.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  @SubscribeMessage('requestUpdate')
  async handleRequestUpdate(client: Socket, payload: { context: string; namespace: string }) {
    if (!payload?.context || !payload?.namespace) return;
    const data = await this.graphService.getGraphData(payload.context, payload.namespace);
    client.emit('graphUpdate', data);
  }
}
