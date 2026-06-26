export interface ApiTraceRecord {
  id: string;
  timestamp: string;
  namespace: string;
  method?: string;
  path?: string;
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  statusCode?: number;
  responseBody?: string;
  sourceIp: string;
  destIp: string;
  destPort: number;
  sourceService?: string;
  destService?: string;
  sourcePod?: string;
  destPod?: string;
  durationMs?: number;
}

export class ApiEventsStore {
  private static records: ApiTraceRecord[] = [];
  private static readonly maxRecords = 3000;
  private static readonly duplicateWindowMs = 1000;
  private static recentSignatures: Map<string, number> = new Map();

  private static readonly systemServicePattern = /^(kube-|coredns|konnectivity|metrics-server|prometheus|grafana|loki|kubernetes)$/i;
  private static readonly noisePathPattern = /metrics|prometheus|telemetry|health|ready|status|socket\.io|portforward|exec|attach/i;
  private static readonly infraRoutePattern = /^\/api\/(kube|telemetry)\b|^\/socket\.io\b|^\/v1\/metrics\b/i;
  private static readonly loopbackPattern = /^(127\.0\.0\.1|localhost|::1)$/i;

  private static endpointOf(record: ApiTraceRecord) {
    return record.endpoint || record.url || record.path || '';
  }

  private static signature(record: ApiTraceRecord) {
    return [
      record.namespace,
      record.method || '',
      this.endpointOf(record),
      record.sourceIp,
      record.destIp,
      record.destPort,
      record.statusCode || '',
    ].join('|');
  }

  private static isServiceTrace(record: ApiTraceRecord) {
    const src = record.sourceService || '';
    const dst = record.destService || '';
    const endpoint = this.endpointOf(record);
    const hasAppService = !!(src || dst);
    const notSystem = !this.systemServicePattern.test(src) && !this.systemServicePattern.test(dst);
    const notNoise = !this.noisePathPattern.test(endpoint);
    const notInfraRoute = !this.infraRoutePattern.test(endpoint);
    const notLoopbackHop = !(this.loopbackPattern.test(record.sourceIp) && this.loopbackPattern.test(record.destIp));
    return hasAppService && notSystem && notNoise && notInfraRoute && notLoopbackHop;
  }

  static add(record: ApiTraceRecord) {
    const now = Date.now();
    const sig = this.signature(record);
    const lastSeen = this.recentSignatures.get(sig);
    if (lastSeen && now - lastSeen < this.duplicateWindowMs) {
      return;
    }
    this.recentSignatures.set(sig, now);

    // Keep the recent-signature cache bounded.
    if (this.recentSignatures.size > 1000) {
      for (const [key, ts] of this.recentSignatures.entries()) {
        if (now - ts > this.duplicateWindowMs * 5) this.recentSignatures.delete(key);
      }
    }

    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(this.records.length - this.maxRecords);
    }
  }

  static listByNamespace(namespace: string, limit = 300): ApiTraceRecord[] {
    const filtered = this.records
      .filter((record) => record.namespace === namespace)
      .filter((record) => this.isServiceTrace(record))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered.slice(0, limit);
  }

  static listServiceTracesByNamespace(namespace: string, limit = 300): ApiTraceRecord[] {
    return this.listByNamespace(namespace, limit);
  }

  static listAll(limit = 300): ApiTraceRecord[] {
    return this.records
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}
