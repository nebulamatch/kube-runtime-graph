# Kube Runtime Graph

Kube Runtime Graph is a real-time, sidecar-less observability platform for Kubernetes. It leverages deep kernel observability (**eBPF**) to map out exactly how your services are interacting at runtime—both at the TCP transport layer and the HTTP application layer. 

**Cloud Agnostic:** Whether you run your workloads in Azure (AKS), Google Cloud (GKE/GCE), AWS (EKS/EC2), or bare-metal Linux servers, Kube Runtime Graph seamlessly monitors your infrastructure. All you need is a standard Linux kernel with eBPF support!

---

## 🌟 Key Features

### 1. Real-Time Topology Mapping
Instantly visualize your cluster's architecture. The frontend uses a dynamic hierarchical auto-layout algorithm that continuously updates the position of your microservices the moment new traffic is detected over the network. 

### 2. Sidecar-less L7 Telemetry
Unlike traditional service meshes (like Istio or Linkerd) that require injecting heavy sidecar proxies into every pod, Kube Runtime Graph uses eBPF to inspect traffic directly at the kernel level.
- Automatically captures **HTTP Methods** (GET, POST, PUT, DELETE).
- Captures exact **API Paths** (e.g., `/api/auth/login`).
- Extracts **HTTP Status Codes** (200, 404, 500) and correlates requests with responses seamlessly.

### 3. Live Metrics Dashboard
A built-in dashboard provides real-time service health generated strictly from live eBPF traces.
- Monitor **Requests per Second (RPS)**.
- Track **P99 Latency** bottlenecks.
- View real-time **Error Rates** and historical traffic trend sparklines.

### 4. Blast Radius & Time Travel
When an outage happens, it's often difficult to figure out what broke first.
- **Time Travel:** Scrub backwards in time to see exactly what your cluster topology looked like 5, 15, or 60 minutes ago.
- **Blast Radius Mode:** Select a degraded node to instantly highlight all upstream and downstream services affected by the failure.

### 5. Instant Degradation Alerts
The backend continuously analyzes your network traces in real-time. If a service starts returning anomalous `5xx` or `4xx` HTTP errors, an intelligent alert is immediately pushed to the UI via WebSockets, notifying you of the exact route and service that is failing.

### 6. Built-in Log Viewer & RBAC Analysis
- Click on any pod in the topology graph to seamlessly tail its live `stdout`/`stderr` logs directly from the Kubernetes API.
- Dedicated RBAC management pages to audit who has access to what inside your namespace.

---

## 🏗️ Architecture

The project is composed of three main components:

### 1. eBPF Agent (`/agent`)
A lightweight Go application deployed as a DaemonSet across your Kubernetes cluster. It runs in the host network namespace.
- **L4 Interception (TCP):** Attaches a kprobe to `tcp_v4_connect` to detect when any pod initiates a database or service connection.
- **L7 Interception (HTTP):** Attaches an `AF_PACKET` raw socket filter to all network interfaces. Parses raw payloads to extract and correlate requests and responses.

### 2. Backend Gateway (`/backend`)
A scalable API and WebSocket server built with NestJS.
- **Event Ingestion:** Receives the high-throughput eBPF telemetry from the DaemonSet agents.
- **Live Broadcasting:** Evaluates anomalous traces and broadcasts fresh graph structures and notifications via `Socket.IO`.
- **K8s Integration:** Uses the official Kubernetes Node.js client to resolve IPs to Pod names, stream logs, and query RBAC policies.

### 3. Frontend Dashboard (`/frontend`)
A highly polished, dynamic web interface built with Next.js and React.
- **Interactive Graph:** Powered by `React Flow` with automated cycle-breaking topological sorting.
- **Real-Time Data:** Updates continuously via WebSocket events.

---

## 🚀 Getting Started

### Prerequisites
- A Kubernetes cluster (AKS, GKE, EKS, or local Minikube/Kind) running a modern Linux kernel.
- `kubectl` configured with cluster access.

### Deployment

Because the agent runs entirely within your infrastructure, installation is as simple as applying standard Kubernetes manifests. No code instrumentation or sidecars required!

1. **Deploy the stack:**
   Deploy the backend, frontend, and the eBPF DaemonSet into your cluster.
   ```bash
   kubectl apply -f k8s/
   ```

2. **Wait for rollouts:**
   Ensure the agent and backend are running.
   ```bash
   kubectl -n kube-system rollout status daemonset/kube-runtime-graph-agent
   kubectl -n kube-system rollout status deployment/kube-runtime-graph-backend
   ```

3. **Access the Dashboard:**
   Port-forward the frontend service to access the UI on your local machine.
   ```bash
   kubectl port-forward svc/kube-runtime-graph-frontend 3000:80 -n kube-system
   ```
   Open `http://localhost:3000` in your browser.

---

## 🛠️ Tech Stack
- **Agent:** Go, eBPF/C, cilium/ebpf
- **Backend:** Node.js, NestJS, Socket.IO, Kubernetes Client
- **Frontend:** React, Next.js, React Flow, Socket.IO Client, Tailwind CSS

## License
MIT
