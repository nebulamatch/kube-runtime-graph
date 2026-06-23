FROM golang:1.21-bullseye AS builder

WORKDIR /app

# Install dependencies for eBPF compilation
RUN apt-get update && apt-get install -y clang llvm libbpf-dev linux-headers-generic

COPY go.mod ./
RUN go mod download

COPY . .

# Generate eBPF Go bindings
RUN go generate ./...

# Build the agent
RUN go build -o agent main.go bpf_bpfel.go

FROM debian:bullseye-slim
WORKDIR /app
COPY --from=builder /app/agent .

# The agent needs to run as privileged to access BPF subsystem
CMD ["./agent"]
