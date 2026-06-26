export interface ApiTraceRecord {
  id: string;
  timestamp: string;
  namespace: string;
  method?: string;
  path?: string;
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
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

  private static readonly systemServicePattern = /^(kube-|coredns|konnectivity|metrics-server|prometheus|grafana|loki|kubernetes)$/i;
  private static readonly noisePathPattern = /metrics|prometheus|telemetry|health|ready|status/i;

  private static isServiceTrace(record: ApiTraceRecord) {
    const src = record.sourceService || '';
    const dst = record.destService || '';
    const endpoint = record.endpoint || record.url || record.path || '';
    const hasAppService = !!(src || dst);
    const notSystem = !this.systemServicePattern.test(src) && !this.systemServicePattern.test(dst);
    const notNoise = !this.noisePathPattern.test(endpoint);
    return hasAppService && notSystem && notNoise;
  }

  static add(record: ApiTraceRecord) {
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
