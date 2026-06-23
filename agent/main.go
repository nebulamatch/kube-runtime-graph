package main

import (
	"fmt"
	"log"
	"time"
)

func main() {
	fmt.Println("Starting eBPF Agent for Kube Runtime Graph...")
	// TODO: Load eBPF programs and connect to K8s API
	for {
		time.Sleep(10 * time.Second)
		log.Println("Agent is running, capturing traffic...")
	}
}
