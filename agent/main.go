package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
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
	SourceIp        string            `json:"sourceIp"`
	DestIp          string            `json:"destIp"`
	DestPort        uint16            `json:"destPort"`
	Method          string            `json:"method,omitempty"`
	Path            string            `json:"path,omitempty"`
	URL             string            `json:"url,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	ResponseHeaders map[string]string `json:"responseHeaders,omitempty"`
	StatusCode      int               `json:"statusCode,omitempty"`
	ResponseBody    string            `json:"responseBody,omitempty"`
}

type bpfHttpEvent struct {
	Saddr   uint32
	Daddr   uint32
	Dport   uint16
	Sport   uint16
	Payload [256]byte
}

var telemetryQueue = make(chan TelemetryPayload, 256)

var telemetryHTTPClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 64,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  true,
	},
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

	go telemetrySender(backendUrl)

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
			enqueueTelemetry(payload)
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
		method, path, fullURL, parsedHeaders, isResponse, respStatus, respHeaders, respBody := parseHTTPMessage(rawPayload)
		// If this is a response packet, emit telemetry containing status and response headers
		if isResponse {
			// Prevent infinite loop by ignoring our own telemetry responses
			if strings.Contains(fullURL, "/api/telemetry") {
				continue
			}

			if shouldSkipTelemetry(path, fullURL, dport, dstIp.String()) {
				continue
			}

			log.Printf("HTTP Response Intercept: %s -> %s:%d status=%d", srcIp, dstIp, dport, respStatus)

			payload := TelemetryPayload{
				SourceIp: srcIp.String(),
				DestIp:   dstIp.String(),
				DestPort: dport,
				StatusCode: respStatus,
				ResponseHeaders: respHeaders,
				ResponseBody: respBody,
			}
			enqueueTelemetry(payload)
			continue
		}

		if method == "" || path == "" {
			continue
		}

		// Prevent infinite loop by ignoring our own telemetry requests
		if strings.Contains(path, "/api/telemetry") || strings.Contains(fullURL, "/api/telemetry") {
			continue
		}

		if shouldSkipTelemetry(path, fullURL, dport, dstIp.String()) {
			continue
		}

		log.Printf("HTTP Intercept: %s %s -> %s:%d %s", method, srcIp, dstIp, dport, path)

		payload := TelemetryPayload{
			SourceIp: srcIp.String(),
			DestIp:   dstIp.String(),
			DestPort: dport,
			Method:   method,
			Path:     path,
			URL:      fullURL,
			Headers:  parsedHeaders,
		}
		enqueueTelemetry(payload)
	}
}

func parseHTTPMessage(raw string) (method string, path string, fullURL string, headers map[string]string, isResponse bool, respStatus int, respHeaders map[string]string, respBody string) {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	lines := strings.Split(raw, "\n")
	if len(lines) == 0 {
		return "", "", "", nil, false, 0, nil, ""
	}

	first := strings.TrimSpace(lines[0])
	// Detect response lines that start with HTTP/1.1 200 OK
	if strings.HasPrefix(first, "HTTP/") {
		isResponse = true
		parts := strings.SplitN(first, " ", 3)
		if len(parts) >= 2 {
			// parse status code
			code := strings.TrimSpace(parts[1])
			if c, err := strconv.Atoi(code); err == nil {
				respStatus = c
			}
		}

		respHeaders = map[string]string{}
		bodyLines := []string{}
		headerDone := false
		for i := 1; i < len(lines); i++ {
			line := lines[i]
			if !headerDone && strings.TrimSpace(line) == "" {
				headerDone = true
				continue
			}
			if !headerDone {
				idx := strings.Index(line, ":")
				if idx > 0 {
					key := strings.ToLower(strings.TrimSpace(line[:idx]))
					value := strings.TrimSpace(line[idx+1:])
					switch key {
					case "content-type", "content-length", "set-cookie", "x-request-id", "traceparent":
						respHeaders[key] = value
					default:
						// keep common headers only to reduce noise
						if len(respHeaders) < 16 {
							respHeaders[key] = value
						}
					}
				}
			} else {
				bodyLines = append(bodyLines, line)
			}
		}
		if len(bodyLines) > 0 {
			respBody = strings.Join(bodyLines, "\n")
		}
		if len(respHeaders) == 0 {
			respHeaders = nil
		}

		return "", "", "", nil, isResponse, respStatus, respHeaders, respBody
	}

	// Otherwise treat as request
	requestLine := first
	parts := strings.SplitN(requestLine, " ", 3)
	if len(parts) < 2 {
		return "", "", "", nil, false, 0, nil, ""
	}

	method = strings.TrimSpace(parts[0])
	path = strings.TrimSpace(parts[1])
	if method == "" || path == "" {
		return "", "", "", nil, false, 0, nil, ""
	}

	selectedHeaders := map[string]string{}
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		idx := strings.Index(line, ":")
		if idx <= 0 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(line[:idx]))
		value := strings.TrimSpace(line[idx+1:])
		switch key {
		case "host", "user-agent", "x-request-id", "traceparent", "content-type", "authorization", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "via", "x-envoy-pair":
			selectedHeaders[key] = value
		default:
			// capture envoy-related headers (prefix) and keep small set
			if strings.HasPrefix(key, "x-envoy-") {
				selectedHeaders[key] = value
			}
		}
	}

	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		fullURL = path
	} else if host, ok := selectedHeaders["host"]; ok && host != "" {
		fullURL = "http://" + host + path
	} else {
		fullURL = path
	}

	if len(selectedHeaders) == 0 {
		selectedHeaders = nil
	}

	return method, path, fullURL, selectedHeaders, false, 0, nil, ""
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

func enqueueTelemetry(payload TelemetryPayload) {
	select {
	case telemetryQueue <- payload:
	default:
	}
}

func telemetrySender(url string) {
	for payload := range telemetryQueue {
		sendTelemetry(url, payload)
	}
}

func shouldSkipTelemetry(path, fullURL string, dport uint16, dstIP string) bool {
	if dstIP == "169.254.169.254" || dstIP == "168.63.129.16" {
		return true
	}
	switch dport {
	case 9153, 10250, 10255, 10257, 10259:
		return true
	}
	lowerPath := strings.ToLower(path)
	if strings.HasPrefix(lowerPath, "/metrics") || strings.HasPrefix(lowerPath, "/health") || strings.HasPrefix(lowerPath, "/ready") || strings.HasPrefix(lowerPath, "/live") {
		return true
	}
	return strings.Contains(strings.ToLower(fullURL), "/api/telemetry")
}

func sendTelemetry(url string, payload TelemetryPayload) {
	jsonData, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create telemetry request: %s", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := telemetryHTTPClient.Do(req)
	if err != nil {
		log.Printf("Failed to send telemetry: %s", err)
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
}

func waitSignal() <-chan os.Signal {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	return sig
}
