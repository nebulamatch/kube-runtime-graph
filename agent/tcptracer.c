// +build ignore

#include <linux/bpf.h>
#include <asm/ptrace.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_endian.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>

char __license[] SEC("license") = "Dual MIT/GPL";

struct event {
    __u32 saddr;
    __u32 daddr;
    __u16 dport;
    __u16 sport;
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

struct http_event {
    __u32 saddr;
    __u32 daddr;
    __u16 dport;
    __u16 sport;
    char payload[64]; // raw http string
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} http_events SEC(".maps");

// Simplified struct sock definition to avoid heavy vmlinux.h dependency
struct sock_common {
    union {
        struct {
            __be32 skc_daddr;
            __be32 skc_rcv_saddr;
        };
    };
    union {
        struct {
            __be16 skc_dport;
            __u16 skc_num;
        };
    };
};

struct sock {
    struct sock_common __sk_common;
};

SEC("kprobe/tcp_v4_connect")
int kprobe__tcp_v4_connect(struct pt_regs *ctx) {
    struct sock *sk = (struct sock *)PT_REGS_PARM1(ctx);
    struct event *e;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        return 0;
    }

    // Read source and destination IPs
    bpf_probe_read_kernel(&e->saddr, sizeof(e->saddr), &sk->__sk_common.skc_rcv_saddr);
    bpf_probe_read_kernel(&e->daddr, sizeof(e->daddr), &sk->__sk_common.skc_daddr);

    // Read ports
    bpf_probe_read_kernel(&e->dport, sizeof(e->dport), &sk->__sk_common.skc_dport);
    bpf_probe_read_kernel(&e->sport, sizeof(e->sport), &sk->__sk_common.skc_num);

    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("socket")
int socket_http_filter(struct __sk_buff *skb) {
    struct ethhdr eth;
    if (bpf_skb_load_bytes(skb, 0, &eth, sizeof(eth)) < 0) return 0;
    
    if (eth.h_proto != bpf_htons(ETH_P_IP)) return 0;
    
    struct iphdr ip;
    if (bpf_skb_load_bytes(skb, sizeof(eth), &ip, sizeof(ip)) < 0) return 0;
    
    if (ip.protocol != IPPROTO_TCP) return 0;
    
    struct tcphdr tcp;
    int ip_hdr_len = ip.ihl * 4;
    if (bpf_skb_load_bytes(skb, sizeof(eth) + ip_hdr_len, &tcp, sizeof(tcp)) < 0) return 0;
    
    int tcp_hdr_len = tcp.doff * 4;
    int payload_offset = sizeof(eth) + ip_hdr_len + tcp_hdr_len;
    
    char payload[8];
    if (bpf_skb_load_bytes(skb, payload_offset, payload, 8) < 0) return 0;
    
    // Check for HTTP methods (GET, POST, PUT, DELETE)
    int is_http = 0;
    if (payload[0] == 'G' && payload[1] == 'E' && payload[2] == 'T' && payload[3] == ' ') is_http = 1;
    if (payload[0] == 'P' && payload[1] == 'O' && payload[2] == 'S' && payload[3] == 'T') is_http = 1;
    if (payload[0] == 'P' && payload[1] == 'U' && payload[2] == 'T' && payload[3] == ' ') is_http = 1;
    if (payload[0] == 'D' && payload[1] == 'E' && payload[2] == 'L' && payload[3] == 'E') is_http = 1;
    if (payload[0] == 'P' && payload[1] == 'A' && payload[2] == 'T' && payload[3] == 'C') is_http = 1;
    
    if (!is_http) return 0;
    
    struct http_event *e = bpf_ringbuf_reserve(&http_events, sizeof(*e), 0);
    if (!e) return 0;
    
    e->saddr = ip.saddr;
    e->daddr = ip.daddr;
    e->sport = tcp.source;
    e->dport = tcp.dest;
    
    // Initialize array to zero
    __builtin_memset(e->payload, 0, sizeof(e->payload));
    bpf_skb_load_bytes(skb, payload_offset, e->payload, sizeof(e->payload) - 1);
    
    bpf_ringbuf_submit(e, 0);
    return 0;
}
