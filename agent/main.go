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
	"syscall"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

// $BPF_CLANG and $BPF_CFLAGS are set by the Makefile.
//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf tcptracer.c -- -I/usr/include/bpf

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

	// Open a ringbuf reader from userspace RINGBUF map
	rd, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		log.Fatalf("Opening ringbuf reader: %s", err)
	}
	defer rd.Close()

	// Close the reader when the process exits
	go func() {
		<-waitSignal()
		rd.Close()
	}()

	log.Println("Waiting for events...")

	backendUrl := os.Getenv("BACKEND_URL")
	if backendUrl == "" {
		backendUrl = "http://backend-service:3001/api/telemetry"
	}

	for {
		record, err := rd.Read()
		if err != nil {
			if err == ringbuf.ErrClosed {
				log.Println("Received signal, exiting..")
				return
			}
			log.Printf("Read from ringbuf failed: %s", err)
			continue
		}

		// Parse the event data
		var event bpfEvent
		if err := binary.Read(bytes.NewBuffer(record.RawSample), binary.LittleEndian, &event); err != nil {
			log.Printf("Parsing ringbuf event failed: %s", err)
			continue
		}

		srcIp := intToIP(event.Saddr)
		dstIp := intToIP(event.Daddr)

		// Reverse bytes for port due to network byte order
		dport := (event.Dport >> 8) | (event.Dport << 8)

		log.Printf("TCP Connect: %s -> %s:%d", srcIp, dstIp, dport)

		// Send to Backend
		payload := TelemetryPayload{
			SourceIp: srcIp.String(),
			DestIp:   dstIp.String(),
			DestPort: dport,
		}

		go sendTelemetry(backendUrl, payload)
	}
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
