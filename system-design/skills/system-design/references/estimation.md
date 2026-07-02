# Capacity Estimation & The Numbers

Back-of-envelope math for step 2. Do this *before* choosing services — the numbers decide the shape
of the system, on any cloud. The goal isn't precision; it's getting the order of magnitude right so
you provision for reality and find the bottleneck before it finds you.

## The shortcuts

**Time:** ~86,400 s/day ≈ **10⁵ s/day**. ~2.6M s/month. ~31.5M s/year (≈ π × 10⁷).

**Data sizes (powers of 10):** KB 10³ · MB 10⁶ · GB 10⁹ · TB 10¹² · PB 10¹⁵.

**Byte sizing of a record:** char/short ≈ 1–2 B · int/float 4 B · long/double 8 B · UUID 16 B ·
timestamp 8 B. A "typical" small row ≈ 100 B–1 KB. Estimate a record's size by summing its fields,
then round up for overhead/indexes.

**QPS:**
- `average QPS = daily requests / 86,400` (i.e. daily requests / 10⁵).
- **`peak QPS ≈ 2–3 × average QPS`** — always size for peak, not average.

**Read/write skew:** default to **read-heavy** unless told otherwise (often 10:1 to 1000:1). This
decides how hard you lean on caches and read replicas.

## The formulas

**Storage per year**
```
storage/yr = writes/day × bytes/write × 365 × replication_factor × (1 + index/overhead)
```
- replication_factor ≈ 3 for a typical durable store.
- overhead ≈ 0.2–1.0 depending on indexes/metadata.
- Multiply by the retention horizon (e.g. ×5 for 5 years) if data is kept.

**Bandwidth**
```
write bytes/sec = write_QPS × avg_object_size
read  bytes/sec = read_QPS  × avg_object_size
```
Convert to Gbps to size network/CDN egress. (1 byte = 8 bits; 1 Gbps = 125 MB/s.) Remember egress
is a first-class *cost* on every cloud, not just a capacity number.

**Cache sizing (80/20 rule)**
Cache the ~20% of data serving ~80% of reads:
```
cache_RAM ≈ hot_object_count × avg_object_size
```
Round up and add headroom; if it doesn't fit one node, you're sharding the cache too.

**Fleet sizing**
```
nodes ≈ peak_concurrent_load / per_node_capacity   (then add headroom, e.g. ×1.3)
```
One commodity box handles ~10K–100K concurrent connections depending on workload — measure, don't
trust the round number.

## Latency numbers every engineer should know

The canonical Jeff Dean / Norvig figures. Memorize the *ratios*, not the digits.

| Operation | Time |
|---|---|
| L1 cache reference | 0.5 ns |
| Branch mispredict | 5 ns |
| L2 cache reference | 7 ns |
| Mutex lock/unlock | 25 ns |
| Main memory reference | 100 ns |
| Compress 1 KB (Snappy) | 3 µs |
| Send 1 KB over 1 Gbps network | 10 µs |
| Read 4 KB random from SSD | 150 µs |
| Read 1 MB sequentially from memory | 250 µs |
| Round trip within same datacenter | 500 µs |
| Read 1 MB sequentially from SSD | 1 ms |
| Disk seek | 10 ms |
| Read 1 MB sequentially from disk | 20 ms |
| Round trip CA ↔ Netherlands | 150 ms |

**Takeaways that change designs:**
- Memory is ~100,000× faster than a disk seek → cache hot data.
- Same-DC round trip (0.5 ms) is ~300× faster than cross-continent (150 ms) → co-locate; cross-region calls dominate the latency budget.
- SSD random read (150 µs) is ~65× faster than a disk seek (10 ms) → SSDs for random access.
- A cross-continent round trip is ~150 ms before you've done any work → CDN/edge for global users.

## Availability math (the 9s)

| Availability | Downtime/year | Downtime/month |
|---|---|---|
| 99% (two 9s) | 3.65 days | 7.2 hours |
| 99.9% (three 9s) | 8.76 hours | 43.8 minutes |
| 99.99% (four 9s) | 52.6 minutes | 4.4 minutes |
| 99.999% (five 9s) | 5.26 minutes | 26 seconds |

Each extra 9 ≈ 10× less downtime — and disproportionately more cost/complexity. **Series
dependencies multiply**: a request through 3 components each at 99.9% is 0.999³ ≈ 99.7%.
**Redundancy adds 9s**: two independent replicas each at 99% give 1 − 0.01² = 99.99% for "at least
one up." This is the core argument for horizontal redundancy across zones. Sanity-check the target
against the managed services' published SLAs — a four-9s promise built on three-9s parts needs
redundancy somewhere.

**Durability ≠ availability.** Object stores advertise 11 nines of *durability* (you won't lose the
object) which is separate from availability (you can reach it right now). Don't conflate them in a
design.

## A worked estimate — TinyURL-style shortener

*Assume:* 100M new URLs/day, read:write = 100:1, each row ≈ 500 B, 5-year retention.

- **Write QPS** = 100M / 10⁵ = **1,000 writes/s** avg; peak ≈ **2–3K/s**.
- **Read QPS** = 100× = **100K reads/s** avg; peak ≈ **200–300K/s**. → read-dominated; this is a caching + read-replica problem, and the cache tier is the real design.
- **Storage** = 100M × 500 B × 365 × 5 ≈ **91 TB** before replication; ×3 ≈ **~270 TB**. → too big for one node → object/NoSQL store + sharding, not a single relational box.
- **Hot cache** = short-link traffic is steeper than 80/20 — assume ~80% of reads hit the hottest ~1% of URLs; caching that hot set ≈ 1M × 500 B ≈ **500 MB** → trivially fits one in-memory cache node; cache is cheap and buys most of the read throughput.
- **Read bandwidth** = 300K/s × 500 B ≈ **150 MB/s ≈ 1.2 Gbps** at peak → fine for any cloud's CDN/LB tier; serve redirects from cache/edge.

The math alone tells you: read-heavy, cache-first, sharded durable store, edge-cacheable redirects.
You chose the architecture before drawing a single box — and before naming a single product.
