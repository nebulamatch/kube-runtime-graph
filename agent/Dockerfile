FROM golang:1.21-bullseye AS builder

WORKDIR /app

# Install dependencies for eBPF compilation
RUN apt-get update && apt-get install -y clang llvm libbpf-dev linux-headers-generic

COPY go.mod ./
RUN go mod download || true

COPY . .

# Download missing dependencies with explicit pinned versions to avoid Go 1.24+ errors
RUN go get github.com/cilium/ebpf/cmd/bpf2go@v0.11.0 \
           github.com/cilium/ebpf@v0.11.0 \
           k8s.io/client-go@v0.28.2 \
           k8s.io/apimachinery@v0.28.2 \
           k8s.io/api@v0.28.2
RUN go mod tidy

# Fix for missing asm/types.h during clang eBPF compilation on Debian
RUN ln -s /usr/include/x86_64-linux-gnu/asm /usr/include/asm

# Generate eBPF Go bindings
RUN go generate ./...

# Build the agent
RUN go build -o agent main.go bpf_bpfel.go

FROM debian:bullseye-slim
WORKDIR /app
COPY --from=builder /app/agent .

# The agent needs to run as privileged to access BPF subsystem
CMD ["./agent"]
