# Kube Runtime Graph

Kube Runtime Graph is a real-time telemetry and visualization tool for Kubernetes clusters. It leverages deep kernel observability (eBPF) to map out exactly how your microservices are interacting at runtime—both at the TCP transport layer and the HTTP application layer—without requiring any sidecar proxies or code instrumentation.

## Architecture

The project is composed of three main components:

### 1. eBPF Agent (`/agent`)
A lightweight Go application deployed as a DaemonSet across your Kubernetes cluster. It runs in the host network namespace and uses eBPF (Extended Berkeley Packet Filter) to observe traffic deep inside the Linux kernel.
- **L4 Interception (TCP):** Attaches a kprobe to `tcp_v4_connect` to detect when any pod initiates a database or service connection.
- **L7 Interception (HTTP):** Attaches an `AF_PACKET` raw socket filter to all network interfaces (`Ifindex: 0`). It parses the raw packet payloads to extract HTTP Methods (GET, POST, PUT, DELETE) and API endpoints (e.g., `/api/auth/health`).
- **Telemetry Engine:** Filters out noise (like Azure IMDS or its own telemetry loop) and sends clean, real-time edge data to the backend gateway.

### 2. Backend Gateway (`/backend`)
A scalable API and WebSocket server built with NestJS.
- **Event Ingestion:** Receives the high-throughput eBPF telemetry from the DaemonSet agents.
- **Live Graph Broadcast:** Broadcasts the network edges (source IP, destination IP, and HTTP path labels) via Socket.IO to connected clients.
- **Kubernetes Integration:** Uses the official Kubernetes Node.js client to map pod IPs to actual Pod Names, resolve Namespaces, and stream live interactive terminal logs from specific containers.

### 3. Frontend Dashboard (`/frontend`)
A dynamic web interface built with Next.js and React.
- **Interactive Graph:** Uses `React Flow` to visualize your cluster. Pods are rendered as nodes, and active network connections are rendered as animated edges. 
- **Auto-Layout:** Integrates the `dagre` layout engine to automatically align and structure the nodes hierarchically.
- **Layer 7 Context:** Network edges are dynamically labeled with the exact HTTP paths being requested over them in real time (e.g., `[POST /api/telemetry]`).
- **Log Viewer:** Clicking on any pod node opens a sliding side-panel that streams the live stdout/stderr logs of that specific container directly from the Kubernetes API.

## Getting Started

### Prerequisites
- A Kubernetes cluster (AKS, EKS, GKE, or local Minikube/Kind)
- `kubectl` configured with cluster access
- Helm (optional) or standard `k8s/` YAML manifests

### Deployment

1. **Build and push images:**
   GitHub Actions are configured to automatically build Docker images for all three components upon merging to `master`.

2. **Deploy the stack:**
   Deploy the backend, frontend, and the eBPF DaemonSet into your cluster.
   ```bash
   kubectl apply -f k8s/backend.yaml
   kubectl apply -f k8s/frontend.yaml
   kubectl apply -f k8s/agent.yaml
   ```

3. **Access the Dashboard:**
   Port-forward the frontend service to access the UI on your local machine.
   ```bash
   kubectl port-forward svc/kube-runtime-graph-frontend 3000:80 -n kube-system
   ```
   Open `http://localhost:3000` in your browser.

## Tech Stack
- **Agent:** Go, eBPF/C, cilium/ebpf
- **Backend:** Node.js, NestJS, Socket.IO, Kubernetes Client
- **Frontend:** React, Next.js, React Flow, Dagre, Socket.IO Client

## License
MIT
