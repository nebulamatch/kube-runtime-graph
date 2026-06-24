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
  private clientSelections: Map<string, { context: string; namespace: string }> = new Map();
  // Telemetry buffering to batch frequent telemetry updates and reduce socket churn
  private telemetryBuffer: any[] = [];
  private telemetryFlushMs = 300;
  private telemetryFlushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly graphService: GraphService,
    private readonly kubeService: KubeService,
  ) {}

  // Enqueue a telemetry delta (edge/newNodes) to be flushed to clients periodically
  enqueueTelemetry(delta: any) {
    if (!delta) return;
    this.telemetryBuffer.push(delta);

    if (!this.telemetryFlushTimer) {
      this.telemetryFlushTimer = setInterval(() => this.flushTelemetry(), this.telemetryFlushMs);
    }
  }

  private flushTelemetry() {
    if (this.telemetryBuffer.length === 0) return;
    const items = this.telemetryBuffer.splice(0, this.telemetryBuffer.length);

    if (items.length === 1) {
      // keep backward compatibility: single payload contains {edge, newNodes}
      this.server.emit('telemetryUpdate', items[0]);
    } else {
      // emit batched payload
      this.server.emit('telemetryUpdate', { batch: true, items });
    }
    // if buffer emptied, stop timer until next enqueue
    if (this.telemetryBuffer.length === 0 && this.telemetryFlushTimer) {
      clearInterval(this.telemetryFlushTimer);
      this.telemetryFlushTimer = null;
    }
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    // Initial connection doesn't have namespace context yet.
    // The client will emit 'requestUpdate' with context/namespace.
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.clientSelections.delete(client.id);
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
    this.clientSelections.set(client.id, { context: payload.context, namespace: payload.namespace });
    const data = await this.graphService.getGraphData(payload.context, payload.namespace);
    client.emit('graphUpdate', data);
  }

  // Broadcast a fresh graph to all clients after telemetry changes topology.
  async broadcastFreshGraph(context: string, namespace: string) {
    if (!context || !namespace) return;
    const data = await this.graphService.getGraphData(context, namespace);
    this.server.emit('graphUpdate', data);
  }

  async broadcastFreshGraphToMatchingClients() {
    const entries = Array.from(this.clientSelections.entries());
    for (const [clientId, selection] of entries) {
      const socket = this.server.sockets.sockets.get(clientId);
      if (!socket) continue;
      const data = await this.graphService.getGraphData(selection.context, selection.namespace);
      socket.emit('graphUpdate', data);
    }
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
