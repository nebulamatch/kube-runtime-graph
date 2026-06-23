import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GraphService } from './graph.service';
import { KubeService } from '../kube/kube.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GraphGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private interval: NodeJS.Timeout | null = null;
  private logStreams: Map<string, any> = new Map();

  constructor(
    private readonly graphService: GraphService,
    private readonly kubeService: KubeService,
  ) {}

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
    // Clean up log streams
    if (this.logStreams.has(client.id)) {
      const req = this.logStreams.get(client.id);
      if (req && req.abort) req.abort();
      this.logStreams.delete(client.id);
    }
  }

  @SubscribeMessage('requestUpdate')
  async handleRequestUpdate(client: Socket, payload: { context: string; namespace: string }) {
    if (!payload?.context || !payload?.namespace) return;
    const data = await this.graphService.getGraphData(payload.context, payload.namespace);
    client.emit('graphUpdate', data);
  }

  @SubscribeMessage('subscribeLogs')
  async handleSubscribeLogs(client: Socket, payload: { context: string; namespace: string; podName: string }) {
    if (!payload?.context || !payload?.namespace || !payload?.podName) return;
    
    // Clean up existing stream for this client
    if (this.logStreams.has(client.id)) {
      const req = this.logStreams.get(client.id);
      if (req && req.abort) req.abort();
      this.logStreams.delete(client.id);
    }

    console.log(`Client ${client.id} subscribing to logs for pod: ${payload.podName}`);
    
    const req = await this.kubeService.streamPodLogs(
      payload.context,
      payload.namespace,
      payload.podName,
      (logLine) => {
        client.emit('logUpdate', logLine);
      }
    );
    
    if (req) {
      this.logStreams.set(client.id, req);
    }
  }

  @SubscribeMessage('unsubscribeLogs')
  handleUnsubscribeLogs(client: Socket) {
    if (this.logStreams.has(client.id)) {
      const req = this.logStreams.get(client.id);
      if (req && req.abort) req.abort();
      this.logStreams.delete(client.id);
      console.log(`Client ${client.id} unsubscribed from logs`);
    }
  }
}
