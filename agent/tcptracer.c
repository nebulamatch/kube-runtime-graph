// +build ignore

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

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
