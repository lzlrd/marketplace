# Networking & OS Fundamentals for System Design

The lower-level facts that shape designs and surface in infra-flavored design discussions. Read when
a design hinges on networking behavior (DNS routing, load-balancer layer, connection limits, TLS) or
OS-level limits (file descriptors, ephemeral ports, kernel tunables). Condensed from the user's
`Interview Prep/Linux and Networking/` deep-dives — if that workspace is available, go there for
full detail.

## OSI model & the transport layer

Seven layers; the ones that matter for design are L3 (Network/IP), L4 (Transport/TCP-UDP), and L7
(Application/HTTP). "Layer 4 vs Layer 7" load balancing refers to these.

**TCP** (L4, connection-oriented, reliable): three-way handshake (SYN → SYN-ACK → ACK) sets up a
connection before data flows; ordered, retransmitted, flow-controlled. The handshake costs a round
trip — at cross-continent latency (~150 ms) that's visible, which is why connection reuse,
keep-alive, and edge termination matter. Use for anything needing reliability (HTTP, DB
connections).

**UDP** (L4, connectionless, unreliable): no handshake, no ordering, no retransmit — just fast. Use
for time-sensitive workloads where a late packet is worse than a lost one: live streaming, gaming,
VoIP, DNS, some telemetry.

**Design implication:** the handshake + slow-start cost makes new connections expensive. Pool DB
connections; reuse HTTP connections; terminate TLS at the edge so the expensive handshake happens
close to the user.

## DNS as a traffic-steering layer

DNS resolves names → IPs, and it's also a **routing tool**. Resolution walks root → TLD →
authoritative; results are cached per TTL at many layers. Low TTLs enable fast failover but raise
query volume; high TTLs cache better but slow changes — a real tradeoff for failover design.

Routing policies (latency, geo, weighted, failover, multivalue) let DNS steer users to the nearest
or healthiest region — the basis of canary rollouts, active-passive DR, and global apps:
→ Route 53 policies · Traffic Manager (Azure DNS hosts zones; Traffic Manager does the routing) ·
Cloud DNS routing policies. GCP often skips DNS steering entirely — its global anycast L7 load
balancer routes to the nearest healthy region on one IP.

Health checks drive failover; DNS-level failover is bounded below by TTL, so it's coarse — pair
with in-region load-balancer health checks for fast local failover.

## Load balancing: L4 vs L7

- **L4:** routes on IP/port without inspecting payload. Ultra-low latency, millions of connections,
  static IP, preserves source IP, any TCP/UDP protocol. → NLB · Azure Load Balancer · Network LB.
- **L7:** inspects HTTP — routes on path/host/header, terminates TLS, WebSockets, redirects, WAF
  integration. → ALB · Application Gateway (regional) / Front Door (global) · Application LB.
- **Anycast:** one IP advertised from many locations; the network routes to the nearest — global
  entry without DNS-TTL failover lag. → Global Accelerator · Front Door · GCP's global external
  Application LB (anycast is its default mode).

## IP, NAT, subnets, and the virtual network

- **Private ranges** (10.0.0.0/8, 172.16/12, 192.168/16) aren't internet-routable — the basis of
  VPC/VNet addressing. Plan CIDR blocks so subnets don't overlap (peering and on-prem links make
  overlaps permanent regret) and leave room to grow.
- **Public vs private subnets:** public has a route to an internet gateway; private reaches out via
  a **NAT gateway** (outbound only) — put databases and app tiers in private subnets, load balancers
  in public. Standard secure layout and a defense-in-depth point on every cloud (NAT Gateway on
  AWS and Azure; Cloud NAT on GCP).
- **Network scope differs by cloud — a real design difference:** AWS VPCs and Azure VNets are
  **regional** (subnets per-AZ/regional; cross-region needs peering or hub-and-spoke). A GCP VPC is
  **global** with regional subnets — cross-region private traffic needs no peering. Multi-region
  designs are cheaper to wire on GCP and need explicit topology work on AWS/Azure.
- **BGP** routes between Autonomous Systems on the public internet; **anycast** (same IP from many
  places) is how CDNs/DNS get you to the nearest POP.
- **Private service connectivity** (no internet transit to reach PaaS): PrivateLink · Private
  Link/Private Endpoint · Private Service Connect. On-prem links: Direct Connect · ExpressRoute ·
  Cloud Interconnect (+ VPN on each).

## Sockets, ports, and connection limits

- A connection is identified by the 4-tuple (src IP, src port, dst IP, dst port). **Ephemeral
  ports** (Linux default 32768–60999; IANA 49152–65535) limit how many *outbound* connections one
  machine can open to a single destination — a real ceiling for a busy proxy/gateway, mitigated by
  multiple destinations or source IPs.
- **File descriptors:** every socket is an fd. The default per-process limit (`ulimit -n`, often
  1024) is far too low for a server holding tens of thousands of connections — must be raised. This
  is a classic "why does it fall over at N connections" answer.
- One tuned box handles ~10K–100K concurrent connections (the C10K/C10M problem); beyond that you
  scale out behind a load balancer.

## TLS

Encrypts data in transit (a security-pillar requirement on every framework). The handshake adds
round trips (TLS 1.3 cut it to one; 0-RTT resumption to zero for repeat visits). **Terminate TLS at
the edge** (CDN/global LB) to amortize the handshake near the user and offload origin CPU; decide
whether the internal hop is re-encrypted (end-to-end) or plaintext within the private network
(cheaper, relies on network isolation — some compliance regimes forbid it). SNI lets one IP serve
many certs; every cloud has managed cert issuance/rotation (ACM · Key Vault certificates / Front
Door managed certs · Certificate Manager).

## OS / kernel knobs that affect a design

Mostly relevant for self-managed VMs (managed services handle these for you), but worth knowing
because they explain capacity ceilings:

- **File-descriptor limits** (`ulimit -n`, `fs.file-max`) — cap concurrent connections; raise for servers.
- **Ephemeral port range** (`net.ipv4.ip_local_port_range`) — caps outbound connections per destination.
- **TCP backlog** (`net.core.somaxconn`, `tcp_max_syn_backlog`) — cap pending connections; raise for high accept rates.
- **TIME_WAIT** accumulation — many short-lived connections exhaust ports; reuse connections or tune `tcp_tw_reuse`.
- **Page cache / memory pressure** — the OS caches hot file data in RAM; explains why "warm" reads are fast and cold starts slow.

**The point for design:** when someone asks "why does this tier cap out at N connections /
requests," the answer is usually fd limits, ephemeral ports, or the connection backlog — not CPU.
Managed services abstract these but have their own documented quotas (Lambda concurrency, Cosmos DB
RUs, Cloud Run instance caps…); check them when sizing.
