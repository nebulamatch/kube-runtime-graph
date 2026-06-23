FROM golang:1.21-bullseye AS builder

WORKDIR /app

# Install dependencies for eBPF compilation
RUN apt-get update && apt-get install -y clang llvm libbpf-dev linux-headers-generic

COPY go.mod ./
RUN go mod download || true

COPY . .

# Download missing dependencies
RUN go get github.com/cilium/ebpf/cmd/bpf2go github.com/cilium/ebpf k8s.io/client-go k8s.io/apimachinery k8s.io/api
RUN go mod tidy

# Generate eBPF Go bindings
RUN go generate ./...

# Build the agent
RUN go build -o agent main.go bpf_bpfel.go

FROM debian:bullseye-slim
WORKDIR /app
COPY --from=builder /app/agent .

# The agent needs to run as privileged to access BPF subsystem
CMD ["./agent"]
