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
    // Send initial graph data
    client.emit('graphUpdate', this.graphService.getGraphData());

    // Start emitting simulated traffic updates if not already doing so
    if (!this.interval) {
      this.interval = setInterval(() => {
        const data = this.graphService.simulateTraffic();
        this.server.emit('graphUpdate', data);
      }, 2000); // Update every 2 seconds
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    if (this.server.sockets.sockets.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  @SubscribeMessage('requestUpdate')
  handleRequestUpdate(client: Socket) {
    client.emit('graphUpdate', this.graphService.getGraphData());
  }
}
