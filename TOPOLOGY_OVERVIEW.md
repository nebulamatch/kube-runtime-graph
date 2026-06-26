# KubeGraph Topology Overview

## Current System Architecture

Your system has a **hierarchical, top-down microservices architecture** with three distinct layers:

---

## 📊 Topology Structure

### Level 0: Infrastructure (Top)

```
┌─────────────────┐
│  Kubernetes     │
│  (Orchestrator) │
└────────┬────────┘
```

- Kubernetes serves as the orchestration layer managing all workloads

---

### Level 1: API Gateway Services (Middle Tier)

```
        ┌──────────────────┐
        │  api-service     │
        │  (REST Gateway)  │
        └──────────────────┘
                │
        ┌───────┴───────┐
        │               │
   ┌─────────────────────────────────┐ ┌────────────────────────┐
   │  notification-service           │ │  payment-service       │
   │  (Event notifications & alerts) │ │  (Payment processing)  │
   └─────────────────────────────────┘ └────────────────────────┘
```

**Services at this tier:**

- `api-service` - Primary REST API gateway
- `notification-service` - Handles event notifications and alerts
- `payment-service` - Processes payment transactions

---

### Level 2: Core Business Services (Bottom Tier)

```
        ┌────────────┐
        │ api-service│
        └─────┬──────┘
              │
    ┌─────────┼─────────┬──────────┐
    │         │         │          │
    ▼         ▼         ▼          ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
│ auth    │ │ svc      │ │ user     │ │ order   │
│service  │ │service   │ │service   │ │service  │
└─────────┘ └──────────┘ └──────────┘ └─────────┘
```

**Services at this tier:**

- `auth-service` - Authentication & authorization layer
- `svc-service` - Service discovery/registry
- `user-service` - User management & profiles
- `order-service` - Order processing & management

---

## 🔗 Service Bindings & Dependencies

### Service Communication Flow

**Orange Dashed Lines** = Service-to-Service HTTP Connections

```
api-service (Level 1)
    ├──→ auth-service (authentication gateway)
    ├──→ svc-service (service discovery)
    ├──→ user-service (user queries)
    └──→ order-service (order operations)

notification-service (Level 1)
    └──→ [Event-driven architecture]

payment-service (Level 1)
    ├──→ auth-service
    ├──→ order-service
    └──→ [Transaction logging]
```

### Pod-to-Service Mapping

Each service runs multiple pods for high availability:

```
api-service
  ├─ api-service-pod-1
  ├─ api-service-pod-2
  └─ api-service-pod-3

auth-service
  └─ auth-service-pod-1

user-service
  ├─ user-service-pod-1
  └─ user-service-pod-2

order-service
  ├─ order-service-pod-1
  ├─ order-service-pod-2
  └─ order-service-pod-3

[... and so on for all services]
```

---

## 📡 Data Flow & Telemetry

### How Service Communication is Tracked

1. **Traffic Detection**: Agent captures network traffic at pod level
2. **IP Resolution**:
   - Pod IP → Service mapping via Kubernetes DNS
   - Source/Dest IP addresses are resolved to services
3. **Telemetry Enrichment**:
   - HTTP method (GET, POST, PUT, DELETE, etc.)
   - Request path/endpoint
   - Response status code
   - Duration (latency)
   - Error rates

### Telemetry Payload Structure

```json
{
  "sourceIp": "10.0.1.5",
  "destIp": "10.0.2.10",
  "destPort": 8080,
  "method": "POST",
  "path": "/api/orders",
  "url": "http://order-service:8080/api/orders",
  "statusCode": 201,
  "durationMs": 145,
  "headers": {...}
}
```

This gets resolved to:

```json
{
  "sourceService": "api-service",
  "destService": "order-service",
  "sourcePod": "api-service-pod-2",
  "destPod": "order-service-pod-1",
  "endpoint": "POST /api/orders"
}
```

---

## 🗄️ Database Layer (Auto-Discovered)

### Current Database Nodes

Dynamically discovered based on telemetry:

- Kubernetes is watching for traffic to non-service IPs
- Once detected, databases are positioned in Level 3
- Service connections to databases appear as special connections

**Service-to-Database Bindings** (inferred from traffic):

```
api-service → [Databases discovered via telemetry]
user-service → [User database]
order-service → [Order database]
payment-service → [Payment ledger]
auth-service → [Auth database]
```

---

## 🏗️ Architecture Patterns

### 1. **API Gateway Pattern**

- `api-service` acts as single entry point
- Routes requests to appropriate downstream services
- Provides unified interface

### 2. **Microservices Pattern**

- Each business domain has dedicated service (users, orders, payments)
- Services are loosely coupled
- Independent scaling

### 3. **Service Discovery**

- `svc-service` handles service registration & discovery
- Services discover each other via Kubernetes DNS
- Dynamic endpoint resolution

### 4. **Authentication/Authorization**

- Centralized `auth-service` for all auth flows
- Called by upstream services before processing requests

---

## 📊 Connection Types in Graph

### Standard Connections (Green/Primary Color)

- Pod → Service (internal)
- Service → Service (HTTP communication)

### Special Connections (Orange Dashed Lines)

- Non-pod to non-pod connections
- Service → Database connections
- External service communication

---

## 🔍 Current Observability

### What's Being Tracked

1. **Service Topology**: Static from Kubernetes manifests
2. **Pod Status**: Running, Pending, Failed, Succeeded
3. **Live Traffic**: HTTP requests between services (from agent telemetry)
4. **Performance Metrics**:
   - Request latency
   - Error rates
   - Requests per second (RPS)
   - HTTP status codes

### What's Displayed in Graph

- **Nodes**: Services, Pods (when expanded), Databases (auto-discovered)
- **Edges**: Real-time traffic flows with labels showing:

  - HTTP method
  - Endpoint path
  - Request direction
- **Metrics**: Each node shows:

  - RPS (calculated from telemetry)
  - Latency (average, p99)
  - Error rate
  - Service status

---

## 🎛️ Configuration & Detection

### Automatic Detection

✅ Services are auto-discovered from Kubernetes
✅ Pods are grouped by service selectors
✅ Databases discovered from IP mappings in telemetry
✅ Service-to-service calls inferred from traffic
✅ No hardcoded services or endpoints

### Dynamic Enrichment

- **Caching**: 2-second TTL to avoid API overhead
- **IP Mapping**: Maintains Pod IP → Service ID mappings
- **Service Port Discovery**: Uses Kubernetes service specs
- **Namespace Isolation**: Queries scoped by namespace

---

## 🚀 How Data Flows Through the System

```
1. Agent (tcptracer) captures network traffic
   ↓
2. Sends telemetry payload to backend (/api/telemetry)
   ↓
3. Backend GraphService processes:
   - Resolves IPs to services/pods
   - Creates/updates edges in graph
   - Calculates performance metrics
   ↓
4. Telemetry stored in ApiEventsStore (for Events page)
   ↓
5. GraphGateway broadcasts:
   - graphUpdate (full topology)
   - telemetryUpdate (real-time edges)
   ↓
6. Frontend receives and renders:
   - Updates nodes/edges
   - Preserves zoom/pan state
   - Shows live metrics
```

---

## 📈 Hierarchy Calculation

Services are positioned vertically based on:

1. **Root services**: Called by others, don't call many (top)
2. **Middle services**: Call and are called (middle)
3. **Leaf services**: Call others, not called much (bottom)
4. **Database tier**: Auto-discovered external resources

```typescript
// From graph.service.ts
const hierarchy = this.calculateServiceHierarchy(serviceIds);
// Returns hierarchy level (0, 1, 2, 3...)
// Positioned: level * 400px vertical spacing
```

---

## 🎯 Summary

Your topology represents a **distributed microservices architecture** with:

- ✅ 7 total services (3 entry-level + 4 core)
- ✅ Dynamic pod scaling under each service
- ✅ Real-time service-to-service communication tracking
- ✅ Auto-discovered database layer
- ✅ Top-to-bottom hierarchical visualization
- ✅ Live performance metrics via agent telemetry
- ✅ Namespace isolation for multi-tenant support
