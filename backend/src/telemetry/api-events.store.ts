export interface ApiTraceRecord {
  id: string;
  timestamp: string;
  namespace: string;
  method?: string;
  path?: string;
  url?: string;
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
}

export class ApiEventsStore {
  private static records: ApiTraceRecord[] = [];
  private static readonly maxRecords = 3000;

  static add(record: ApiTraceRecord) {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(this.records.length - this.maxRecords);
    }
  }

  static listByNamespace(namespace: string, limit = 300): ApiTraceRecord[] {
    const filtered = this.records
      .filter((record) => record.namespace === namespace)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered.slice(0, limit);
  }

  static listAll(limit = 300): ApiTraceRecord[] {
    return this.records
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}
