package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"unsafe"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf tcptracer.c -- -I/usr/include/bpf -D__TARGET_ARCH_x86

type bpfEvent struct {
	Saddr uint32
	Daddr uint32
	Dport uint16
	Sport uint16
}

type TelemetryPayload struct {
	SourceIp string `json:"sourceIp"`
	DestIp   string `json:"destIp"`
	DestPort uint16 `json:"destPort"`
	Method   string `json:"method,omitempty"`
	Path     string `json:"path,omitempty"`
}

type bpfHttpEvent struct {
	Saddr   uint32
	Daddr   uint32
	Dport   uint16
	Sport   uint16
	Payload [64]byte
}

func main() {
	// Allow the current process to lock memory for eBPF resources.
	if err := rlimit.RemoveMemlock(); err != nil {
		log.Fatal("Removing memlock:", err)
	}

	// Load pre-compiled programs and maps into the kernel.
	objs := bpfObjects{}
	if err := loadBpfObjects(&objs, nil); err != nil {
		log.Fatalf("Loading objects: %v", err)
	}
	defer objs.Close()

	// Attach kprobe to tcp_v4_connect
	kp, err := link.Kprobe("tcp_v4_connect", objs.KprobeTcpV4Connect, nil)
	if err != nil {
		log.Fatalf("Opening kprobe: %s", err)
	}
	defer kp.Close()

	log.Println("Successfully attached kprobe to tcp_v4_connect")

	// Attach socket filter to ALL interfaces (Ifindex: 0)
	sock, err := syscall.Socket(syscall.AF_PACKET, syscall.SOCK_RAW, int(htons(syscall.ETH_P_ALL)))
	if err != nil {
		log.Fatalf("Failed to create raw socket: %v", err)
	}
	defer syscall.Close(sock)

	sll := syscall.SockaddrLinklayer{
		Ifindex:  0, // 0 means all interfaces
		Protocol: htons(syscall.ETH_P_ALL),
	}
	if err := syscall.Bind(sock, &sll); err != nil {
		log.Fatalf("Failed to bind raw socket to all interfaces: %v", err)
	}

	if err := syscall.SetsockoptInt(sock, syscall.SOL_SOCKET, 50 /* SO_ATTACH_BPF */, objs.SocketHttpFilter.FD()); err != nil {
		log.Fatalf("Failed to attach BPF socket filter: %v", err)
	}
	log.Println("Successfully attached socket filter to ALL interfaces for L7 interception")

	// Open ringbuf readers
	rd, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		log.Fatalf("Opening tcp ringbuf reader: %s", err)
	}
	defer rd.Close()

	httpRd, err := ringbuf.NewReader(objs.HttpEvents)
	if err != nil {
		log.Fatalf("Opening http ringbuf reader: %s", err)
	}
	defer httpRd.Close()

	go func() {
		<-waitSignal()
		rd.Close()
		httpRd.Close()
	}()

	log.Println("Waiting for events...")

	backendUrl := os.Getenv("BACKEND_URL")
	if backendUrl == "" {
		backendUrl = "http://backend-service:3001/api/telemetry"
	}

	// Goroutine for L4 TCP Connect events
	go func() {
		for {
			record, err := rd.Read()
			if err != nil {
				if err == ringbuf.ErrClosed {
					return
				}
				continue
			}

			var event bpfEvent
			if err := binary.Read(bytes.NewBuffer(record.RawSample), binary.LittleEndian, &event); err != nil {
				continue
			}

			srcIp := intToIP(event.Saddr)
			dstIp := intToIP(event.Daddr)
			dport := (event.Dport >> 8) | (event.Dport << 8)

			payload := TelemetryPayload{
				SourceIp: srcIp.String(),
				DestIp:   dstIp.String(),
				DestPort: dport,
			}
			go sendTelemetry(backendUrl, payload)
		}
	}()

	// Main loop for L7 HTTP events
	for {
		record, err := httpRd.Read()
		if err != nil {
			if err == ringbuf.ErrClosed {
				log.Println("Received signal, exiting..")
				return
			}
			continue
		}

		var event bpfHttpEvent
		if err := binary.Read(bytes.NewBuffer(record.RawSample), binary.LittleEndian, &event); err != nil {
			continue
		}

		srcIp := intToIP(event.Saddr)
		dstIp := intToIP(event.Daddr)
		dport := (event.Dport >> 8) | (event.Dport << 8)

		rawPayload := string(bytes.Trim(event.Payload[:], "\x00"))
		parts := strings.SplitN(rawPayload, " ", 3)
		if len(parts) >= 2 {
			method := parts[0]
			path := parts[1]

			// Prevent infinite loop by ignoring our own telemetry requests
			if strings.Contains(path, "/api/telemetry") {
				continue
			}

			// Ignore cloud metadata spam
			if dstIp.String() == "169.254.169.254" || dstIp.String() == "168.63.129.16" {
				continue
			}

			log.Printf("HTTP Intercept: %s %s -> %s:%d %s", method, srcIp, dstIp, dport, path)

			payload := TelemetryPayload{
				SourceIp: srcIp.String(),
				DestIp:   dstIp.String(),
				DestPort: dport,
				Method:   method,
				Path:     path,
			}
			go sendTelemetry(backendUrl, payload)
		}
	}
}

func htons(i uint16) uint16 {
	b := make([]byte, 2)
	binary.BigEndian.PutUint16(b, i)
	return *(*uint16)(unsafe.Pointer(&b[0]))
}

func intToIP(ip uint32) net.IP {
	result := make(net.IP, 4)
	binary.LittleEndian.PutUint32(result, ip)
	return result
}

func sendTelemetry(url string, payload TelemetryPayload) {
	jsonData, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to send telemetry: %s", err)
		return
	}
	defer resp.Body.Close()
}

func waitSignal() <-chan os.Signal {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	return sig
}
