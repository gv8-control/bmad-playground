# Technical Research: Small-Form-Factor Sandbox Workers for Agent Pipeline

**Date:** 2026-07-23
**Researcher:** opencode (GLM-5.2)
**Status:** Draft
**Confidence:** Medium-High for x86_64 options; Medium for arm64 firmware/software-maturity claims (these shift over time).

## Workload Summary (Calibrates What "Good" Means Here)

Each worker runs a Docker container that hosts an `opencode` AI coding agent for sustained multi-hour runs. The per-container stack is:

- Node.js (opencode runtime)
- Postgres (per-sandbox instance)
- Playwright + Chromium (browser automation headless)
- Devcontainer base: `mcr.microsoft.com/devcontainers/universal:5` — **x86_64 only**

Baseline requirements derived from workload:
- ≥ 8 GB RAM (Chromium + Postgres + Node on a devcontainer base is tight at 4GB; 8GB is the realistic floor, 16GB is comfortable)
- ≥ 4 CPU cores (LLM-token-handling code, parallel test exec, Postgres)
- Fast NVMe storage (agent writes/reads many small files; Chromium profile I/O)
- Sustained thermal/headroom capacity (hour-long runs, not bursty)
- Decent mainline Linux kernel support (cgroups v2, overlayfs, namespaces, seccomp — all needed for Docker/container isolation)

**Critical constraint:** the devcontainers `universal:5` image is x86_64 only. If arm64 workers are used, an additional devcontainer base image must be built/built-from-source equivalent (`universal:5` is not multi-arch). This is a non-trivial migration cost. Therefore **x86_64 is the strongly preferred architecture** for this project unless the team explicitly wants to maintain a parallel arm64 base image.

---

## Category 1 — x86_64 Single-Board Computers & Mini PCs

### C1.A. ODROID-H4+ (Hardkernel, x86_64 SBC)

**Source:** hardkernel.com/shop/odroid-h4-plus (verified July 2026) + ameridroid.com/products/odroid-h4-h4-h4-ultra

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel Processor N97 (Alder Lake-N, Gracemont) — 4C / 4T, base 2.0 GHz, burst 3.6 GHz, AVX2 |
| Max RAM | 48 GB DDR5-4800 SO-DIMM, single slot, single channel (Intel spec'd 16GB but Hardkernel-validated to 48GB) |
| Storage | 1× M.2 PCIe 3.0 x4 (NVMe, NGFF-2280), 1× eMMC socket, **4× SATA III** (H4+ only — base H4 has no SATA) |
| Networking | 2× 2.5 GbE (Intel I226-V) |
| Price (board only) | **$139 USD** (MSRP, board only — no RAM/SSD/PSU/case) |
| Realistic total cost | ~$230–$260 once you add 16GB DDR5 (~$45), 500GB NVMe (~$40), 15V/4A PSU (~$9), case+fan (~$20) |
| Power | Headless idle ~2.0–2.9 W; CPU+GPU stress ~19–22 W; suspend ~1 W; power-off ~0.2 W |
| Linux support | Excellent. Vanilla x86_64 — runs Ubuntu/Debian/fedora/BSD out of the box. Full mainline kernel, cgroups v2, Docker, KVM all work. |
| Differentiators | Only mainstream x86_64 SBC at ~$140-board territory with dual 2.5GbE + NVMe + 4× SATA. Dual-BIOS recovery. 100mm × 100mm was old footprint; H4 series is 120×120mm. |

**Caveat:** Hardkernel has **suspended H4-series production as of mid-2026** due to Intel CPU supply issues. New H4+ stock at ameriDroid is "Out of Stock" and marked sold out. Secondary market / used is the realistic acquisition path today.

### C1.B. ODROID-H4 Ultra (Hardkernel) — the 8-core variant

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel Core i3 N305 (Alder Lake-N) — **8C / 8T**, burst 3.8 GHz |
| Max RAM | 48 GB DDR5-4800 |
| Storage | 1× NVMe PCIe 3.0 x4 + 4× SATA III |
| Price | **$220** board only (MSRP). Out of stock currently. |
| Power | TDP 15W; full-load ~22-25W |
| Differentiators | 2× cores at ~$220. ~2× multithread perf vs H4/H4+ per Hardkernel's own benchmark data. The natural "more compute per worker" sibling. |

### C1.C. ODROID-H5 (Hardkernel, NEW — released ~May 2026)

**Source:** hardkernel.com/shop/odroid-h5 (verified July 2026)

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel Core i3 **N300** — 8C / 8T, burst 3.8 GHz, sustained 2.3 GHz all-core |
| Max RAM | **64 GB** DDR5-4800 SO-DIMM (single channel) |
| Storage | **3× M.2 PCIe 3.0 x2 + 1× M.2 PCIe 3.0 x1** (four NVMe slots! no native SATA) |
| Networking | 1× **10 GbE** (Realtek RTL8127) + optional add-on 10GbE card in an M.2 slot |
| Price | **$230** board only — **in stock / available now** (unlike H4 series) |
| Power | TDP 7W; headless idle ~3W; CPU+GPU stress ~25W; suspend ~1W |
| Differentiators | This is the headline finding. N300 is the high-efficiency variant of N305, ~10–15% lower multi-thread perf but TDP drops from 15W → 7W. 10GbE onboard. **Four M.2 slots** — can fit 4× NVMe SSDs without splitters, OR mix NVMe + AI accelerators + secondary NICs. Best idle-power-per-compute in the x86_64 SBC class. |
| Linux support | Excellent — Ubuntu 26.04 + kernel 7.0 verified by Hardkernel. Same Alder Lake-N family, mainline since kernel 6.x. |

**Why this matters for this project:** If running a fleet of agent workers, you can stack multiple **per-worker NVMe SSDs** on the H5 for container-layer caching without add-on cards. 10GbE also saturates a worker-to-orchestrator network more cheaply than 4× 2.5GbE. N300 idle (~3W) plus 8 cores plus 64GB ceiling is essentially the ideal sandbox-worker profile.

### C1.D. LattePanda 3 Delta

**Source:** lattepanda.com/lattepanda-3-delta (verified July 2026)

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel Celeron **N5105** (Jasper Lake, 11th-gen mobile) — 4C / 4T, burst 2.9 GHz. **No AVX2.** |
| RAM | **8 GB soldered** LPDDR4-2933 (not upgradeable) — *this is the deal-breaker caveat* |
| Storage | M.2 NVMe slot (PCIe 3.0 x4 reported), eMMC optional |
| Networking | 1× GbE (1 GbE, not 2.5), M.2 B-key for 4G/5G, Wi-Fi 6 onboard |
| Price | ~$279 at usual retailers (Digi-Key / DFRobot), bundled with 64GB eMMC |
| Power | TDP 10W, active fan cooling required |
| Differentiators | Soldered RAM caps you at 8GB. No AVX2 (some Node/ml workloads care). Onboard Arduino coprocessor is not useful for this workload. Right at the edge of acceptable specs — 8GB is the floor, not headroom. |
| Verdict | **Not recommended.** At the same ~$230-280 price point the ODROID-H5 is strictly better (8-core vs 4-core, 64GB max vs 8GB soldered, AVX2, 10GbE, lower idle). Only choose LattePanda 3 Delta if you specifically need the integrated Arduino/IO coprocessor for hardware-control scenarios. |

### C1.E. LattePanda Sigma (high-end x86 SBC)

**Source:** lattepanda.com/lattepanda-sigma (verified July 2026)

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel Core i5-1340P (Raptor Lake, 13th gen) — **12C / 16T**, burst 4.6 GHz |
| RAM | **32 GB soldered** dual-channel LPDDR5-6400 (not upgradeable) |
| Storage | 2× M.2 M-key (one PCIe 4.0 x4), 1× M.2 B-key, 1× M.2 E-key, SATA |
| Networking | **2× 2.5 GbE**, 2× Thunderbolt 4 |
| Price | **~$680** at DFRobot (well above the ~$300 budget) |
| Power | TDP up to 44W (active cooling) |
| Differentiators | Performance tier completely different from N-class SBCs — i5-1340P benches ~12,000 in Cinebench R23 multi. Overkill for one agent worker but could host 3-4 containers concurrently. Soldered RAM means no field upgrade path. |

**Verdict:** Out of the budget by ~2× but worth noting as the upper bound of the SBC category. If consolidation (one beefy box serving many workers) becomes attractive, this is more cost-effective than stacking 4× ODROID-H5s.

### C1.F. Consumer N100 Mini PCs (Beelink S12 Pro / Minisforum UN100L/UN100D / similar)

**Note on prices:** web search engines (Google, Bing, DuckDuckGo) all captcha-blocked during this research session, so I'm using widely-known stable street prices for these common SKUs as of mid-2026. These are extremely well-documented consumer products that don't move much in price. Recommend re-verifying on Amazon directly before final procurement decisions.

| Attribute | Value |
|---|---|
| Architecture | x86_64 |
| CPU | Intel N100 (Alder Lake-N, Gracemont) — 4C / 4T, burst 3.4 GHz, AVX2. ~15% slower single-thread than N97 per Hardkernel's analysis. |
| RAM | 16 GB DDR4 (soldered on Beelink S12 Pro / Minisforum UN100D; SO-DIMM upgradeable on Minisforum UN100L) |
| Storage | 500 GB NVMe (PCIe 3.0 x4 typically) included |
| Networking | 1× GbE (1 Gbps, not 2.5), Wi-Fi 6 |
| Price (complete system, not board only) | **~$180-$220** including RAM/SSD/PSU/case (Beelink S12 Pro 16/500 ~$200; Minisforum UN100D ~$180 on sale) |
| Power | TDP 6W; full system ~10-15W typical, idle 6-10W (the bundled PSUs are 36W bricks meaningfully larger than the ODROID 15V/4A) |
| Linux support | Excellent — vanilla x86_64, every distro works. *Caveat:* vendor warranty/support typically only covers Windows. Updating BIOS via vendor tool only. |
| Differentiators | **Complete-system price parity with bare ODROID boards.** sacrificing: 2.5/10 GbE (only 1 GbE), dual-NIC option, RAM upgradeability on soldered variants. Gains: nothing-to-source, ships ready to run. |

**Verdict:** Pragmatic default for small-scale fleet if 1 GbE uplink is sufficient. For multi-worker orchestration that needs to push container images between nodes, the ODROID-H5's 10 GbE (or H4+'s dual 2.5 GbE) is significantly more future-proof.

---

## Category 2 — arm64 SBCs More Server-Grade Than Pi 5

> ⚠️ **Architecture-spanning caveat repeated prominently:** Adopting arm64 means you lose the `mcr.microsoft.com/devcontainers/universal:5` base image. You would need to build an equivalent **arm64 devcontainer base** (multi-day effort to assemble a credible equivalent), and every Playwright browser-version + Node-binary compatibility edge case must be re-validated. arm64 also impacts some prebuilt Node native modules (e.g. `better-sqlite3`, `playwright`'s bundled chromium, node-canvas) — mostly solved in 2025 but still occasional edge cases. Proceed with arm64 only if explicitly accepting this support overhead.

### C2.A. Orange Pi 5 Plus (16GB)

**Source:** orangepi.org product pages + AliExpress 2025 pricing article

| Attribute | Value |
|---|---|
| Architecture | aarch64 (ARMv8.2) |
| CPU | Rockchip **RK3588** — 4× Cortex-A76 @ 2.4 GHz + 4× Cortex-A55 @ 1.8 GHz (big.LITTLE, 8 total cores). 8nm. Mali-G610 MP4 GPU. 6 TOPS NPU. |
| RAM | 4 / 8 / 16 GB LPDDR4/4X (soldered) |
| Storage | 1× M.2 M-key **PCIe 3.0 x4 NVMe** (2280, ~2 GB/s real), eMMC socket, microSD |
| Networking | **2× 2.5 GbE** (RTL8125BG) — this is the standout vs Pi 5 |
| Price | ~**$129-149** (8GB) / ~**$159-199** (16GB) board only (Aliexpress/Amazon). Power supply, case, NVMe, eMMC all extra. Full kit ~$230-280. |
| Power | ~3-5W idle, ~10-15W full stress (Type-C 5V/4A input, included PSU in most kits) |
| Linux support | **Good but vendor-BSP-heavy.** Orange Pi ships Ubuntu 22.04 / Debian 11 / Android 12. Mainline kernel support for RK3588 has improved substantially (rk3588 has been mainline-tracked since ~2023, full features by kernel 6.7+). However: GPU acceleration (Panfrost) and the NPU are still vendor-BSP only. Docker/container isolation features (cgroups v2, overlayfs, namespaces, seccomp) all work on mainline. |
| Differentiators | Best price/perf of the arm64 options. Dual 2.5GbE. NVMe x4 is genuinely fast (saturates ~2 GB/s). 16GB is the only sensible config for this workload. |

### C2.B. Radxa ROCK 5B

**Source:** wiki.radxa.com/Rock5/5B (note: wiki is "no longer maintained" — new docs at docs.radxa.com/en/rock5/rock5b)

| Attribute | Value |
|---|---|
| Architecture | aarch64 |
| CPU | Rockchip RK3588 — same 8-core big.LITTLE as Orange Pi 5 Plus |
| RAM | 4 / 8 / 16 / **32 GB** LPDDR4 @ 3200 MT/s (ROCK 5B uniquely offers 32GB) |
| Storage | 1× M.2 PCIe 3.0 x4 NVMe (2280), eMMC, microSD |
| Networking | 1× 2.5 GbE (not dual, unlike OPi 5 Plus) |
| Price | ~$149 (8GB) / **~$209 (16GB)** / ~$299 (32GB) board only |
| Power | ~2-3W idle, ~10-15W stress; USB-PD/QC powered |
| Linux support | Same RK3588 situation as Orange Pi 5 Plus. Radxa historically has slightly better mainline engagement than Orange Pi — community Debian images from Radxa are reasonably maintained. |
| Differentiators | Only RK3588 board offering **32GB** — useful if you ever want to run multiple agent workers per host. Single 2.5GbE rather than dual. |

### C2.C. Banana Pi BPI-M7

**Status:** Could not verify current specs / pricing — the banana-pi.org product page returned 404 during research, and no major distributor listing surfaced in the unconstrained search results. BPI-M7 also uses **RK3588** per secondary references and is functionally similar to the Orange Pi 5 Plus. Recommend re-checking when availability matters. **Excluded from the comparison table** due to lack of verified source-of-truth.

### C2.D. ODROID-M2 (aarch64, RK3588s, Hardkernel — included for completeness)

This is Hardkernel's arm64 entry. Note: it uses RK3588**s** (cut-down variant with fewer high-speed lanes), not full RK3588.

| Attribute | Value |
|---|---|
| Architecture | aarch64 |
| CPU | Rockchip RK3588**s** — same 8-core big.LITTLE as full RK3588 |
| RAM | 8 GB / 16 GB LPDDR4/4X |
| Storage | M.2 NVMe, eMMC socket |
| Networking | 1× 2.5 GbE |
| Price | ~$130 (8GB) / ~$170 (16GB) — from Hardkernel directly |
| Linux support | Hardkernel ships a maintained Ubuntu image. ODROID forum/community is the strongest of the arm64 vendors at this price point, with good Long-Term-support track record. |
| Differentiators | Best arm64 software/ecosystem reliability at this tier if you want vendor-supported arm64. Slightly less I/O than Orange Pi 5 Plus (no dual-NIC), but more trustworthy firmware updates. |

---

## Headline Question: x86_64 SBC at Pi 5's ~$80 Price Point?

**No, there isn't one with 8+ GB RAM.** Direct verification of the candidate set:

- **LattePanda 3 Delta**: ~$279 street (only 8GB soldered, no upgrade path). Three-and-a-half times the Pi 5 8GB price for similar specs, minus the x86_64 advantage.
- **LattePanda smaller variants** (LattePanda 2 Alpha / 3 Delta without eMMC bundles) still sit at ~$200+ and cap at 8GB.
- **ODROID-H4**: $99 board-only MSRP is the cheapest true x86_64 SBC, but: needs RAM (~$40-50), NVMe (~$40), PSU (~$9), case (~$15). **Realistic total ~$200 minimum**, and currently **out of stock** due to Intel N97 supply issues.
- **Generic Chinese x86_64 SBCs** under $100 (e.g. various "Pi-size x86" boards on AliExpress) universally ship with **4 GB or less soldered RAM** — insufficient for the workload.
- **Consumer N100 mini PCs** (Beelink EQ12 / Minisforum UN100D) routinely hit **~$150-180 complete** (with 16GB+NVMe+PSU), which is **cheaper as a complete system than the cheapest x86 SBC build**. This is the actual answer to "is there an x86_64 device at Pi 5's price point?" — it's not an SBC, it's a consumer mini PC, but it ships ready-to-go and still beats SBCs on price-for-complete-system.

**Bottom line on the Pi-5-price-point question:** x86_64 single-board computers cannot match the Pi 5's economy of scale, and the closest-under-$100 board (ODROID-H4) is currently supply-constrained. For x86_64, the practical floor is **~$180-200 for a complete, ready-to-run system via consumer mini PCs** (Beelink/Minisforum). For a proper SBC with upgradeable RAM and 2.5/10 GbE, **~$230-260 total system cost** (ODROID-H5 + RAM + NVMe + PSU + case) is the realistic floor.

---

## Comparison Table: Top 8 Options

Ranked by fit-for-purpose (sandbox agent worker, x86_64 strongly preferred, 8GB+ RAM, NVMe, Linux/Docker support).

| # | Option | Arch | Cores/Threads | Max RAM | Storage (NVMe slot) | Network | Price (complete, USD) | Idle Power | Linux/Docker | Differentiator |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **ODROID-H5** | x86_64 | i3 N300, 8C/8T @ 3.8GHz | 64 GB DDR5-4800 | **4× M.2** (3× PCIe3x2 + 1× PCIe3x1) | 1× 10 GbE | **~$300-330** (board $230 + 16GB DDR5 $50 + 500GB NVMe $40 + PSU $10) | **~3W** | Excellent (mainline kernel, AVX2, IBECC) | Best idle-perf-per-watt in x86 SBC class. 10GbE is unique. 4 NVMe slots for per-worker storage. **In stock now.** |
| **2** | **ODROID-H4 Ultra** | x86_64 | i3 N305, 8C/8T @ 3.8GHz | 48 GB DDR5-4800 | 1× M.2 PCIe3x4 + 4× SATA | 2× 2.5 GbE | ~$300-330 (board $220 + RAM $50 + NVMe $40 + PSU $10) | ~3-4W | Excellent | Equivalent compute to H5 but slightly higher TDP (15W vs 7W). Dual 2.5GbE better than single 10GbE for некоторые topologies. **Currently out of stock.** |
| **3** | **ODROID-H4+** | x86_64 | N97, 4C/4T @ 3.6GHz | 48 GB DDR5-4800 | 1× M.2 PCIe3x4 + 4× SATA | 2× 2.5 GbE | ~**$210-240** (board $139 + RAM $50 + NVMe $40 + PSU $10) | ~2-3W | Excellent | Cheapest real SBC config with 2× 2.5GbE. **Currently out of stock.** |
| **4** | **Beelink S12 Pro (N100, 16GB/500GB)** | x86_64 | N100, 4C/4T @ 3.4GHz | 16 GB DDR4 soldered | 1× M.2 NVMe (500GB included) | 1× 1 GbE | **~$180-200** (complete, ready to run) | ~6-10W | Excellent | **Cheapest complete system.** Trade-offs: 1 GbE only, RAM not upgradeable. |
| **5** | **Minisforum UN100L (N100)** | x86_64 | N100, 4C/4T @ 3.4GHz | 16 GB DDR4 SO-DIMM (upgradeable) | 1× M.2 NVMe | 1× GbE | ~**$190-220** complete | ~6-10W | Excellent | Same as Beelink but RAM is upgradeable. Better long-term option than soldered-RAM N100 mini PCs. |
| **6** | **Orange Pi 5 Plus (16GB)** | aarch64 | RK3588, 4×A76+4×A55 @2.4/1.8GHz | 16 GB LPDDR4 soldered | 1× M.2 PCIe3x4 NVMe | **2× 2.5 GbE** | ~**$230-280** (board ~$170-200 + NVMe $40 + PSU $15 + case $15) | ~3-5W | Good (vendor BSP; mainline kernel 6.7+ works for container features; GPU/NPU still BSP-only) | Strong arm64 option, dual 2.5GbE. Requires building arm64 devcontainer base image — **significant migration cost**. |
| **7** | **Radxa ROCK 5B (16GB)** | aarch64 | RK3588 (same as OPi 5 Plus) | 16 GB (32 GB option available — ~$299) | 1× M.2 PCIe3x4 NVMe | 1× 2.5 GbE | ~**$260** complete | ~2-3W | Good (similar to OPi 5 Plus; Radxa has slightly better mainline engagement) | Only RK3588 board with 32GB. Single 2.5GbE. Same arm64 migration caveat. |
| **8** | **LattePanda Sigma** | x86_64 | i5-1340P, **12C/16T @4.6GHz** | 32 GB LPDDR5-6400 soldered | 2× M.2 (1× PCIe4x4), SATA, 2× TB4 | 2× 2.5 GbE | **~$680** complete | ~15-44W | Excellent | Performance ceiling ~4× N100. Could host 3-4 agent workers per box → effectively ~$170-230/worker. Soldered RAM caps upgrades. Two Thunderbolt 4 ports. **Most ports/I/O of anything in this comparison.** |

---

## Key Differentiators Called Out

1. **x86_64 vs arm64 is the dominant decision axis**, not raw specs. If you stay on `mcr.microsoft.com/devcontainers/universal:5`, you must pick from the ODROID/Beelink/Minisforum/LattePanda options. Only commit to arm64 (OPi 5 Plus / ROCK 5B / ODROID-M2) if you're willing to build and maintain an equivalent arm64 devcontainer base — that's a shared-services cost across the *whole* platform, not just per-worker.

2. **Idle power matters more than peak power for this workload.** Agent containers don't sustain 100% CPU for hours — they spike during inference calls and tool runs, then idle. The ODROID-H5's ~3W idle (verified by Hardkernel with C10 state >96% occupancy) is materially better than N100 mini PCs (~6-10W idle because of bundled PSUs and vendor BIOS tuning aimed at Windows).

3. **10GbE on the ODROID-H5 is a real differentiator** if agents pull container images between workers, sync git repos, or talk to a central Postgres. Single 10GbE link collapses several infrastructure decisions simultaneously — a fanless 10GbE switch + H5 workers is cheaper overall than distributing 4×2.5GbE fanout across Pi-style boards.

4. **4× M.2 slots on the H5 is almost unique** in this price band. Use-case: one NVMe for the host OS, one for the container image layer cache, and either two more for per-worker scratch OR repurposed for an AI accelerator / second NIC. This eliminates add-on PCIe splitters entirely.

5. **Supply chain reality (mid-2026):** the ODROID-H4/H4+/H4-Ultra are *all out of stock* due to Intel N97/N305 supply constraints. Hardkernel is openly apologizing and has shipped the H5 specifically as a replacement path using the newer N300. If procuring today, choose **ODROID-H5** over any H4 variant. For budget-constrained or rapid-procurement needs, fall back to **Beelink/Minisforum N100 mini PCs**.

6. **8GB RAM is the absolute floor, not a sensible spec.** A devcontainer universal image + Node + Postgres + Chromium headless will use 5-6GB comfortably at idle and spike higher. The **16GB config of every option** is what should be procured; the 8GB options (LattePanda 3 Delta, ODROID-H4 base, OPi 5 Plus 8GB) are *contractually adequate but leave no headroom for the agent misbehaving*, which is exactly the failure mode you want not to have on a long-running sandbox.

7. **Single-thread performance gap is small across all options.** N100 vs N97 vs N300 vs RK3588-A76: single-thread PassMark ranges ~2000-2300. The **8-core options** (N300, N305, RK3588) are roughly **2× the multi-thread throughput** of the N100 class. Since agent workers benefit from multi-threading (parallel tool calls, tests, build), the **8-core options at the same ~$300 budget** are clearly worth it over a 4-core N100.

8. **Mainline kernel support for RK3588 is now adequate for container isolation features** (cgroups v2, overlayfs, user namespaces, seccomp-filter all work on modern mainline). The remaining vendor-BSP items are: GPU acceleration (Panfrost is incomplete), NPU (vendor-only), and hardware video codec (vendor-only). For a headless agent worker you don't need GPU/NPU/video — so **mainline kernel is sufficient for arm64 workers if you choose to go that route**, just not blessed-and-shipped by the vendor.

---

## Recommendations

**If forced to pick one option for a fleet today:** ODROID-H5 with 16GB DDR5 + 500GB NVMe + 15V/4A PSU + Type-1 case + slim fan. ~$310/worker. Lowest idle power in class, 8 cores, x86_64 devcontainer compatibility preserved, 10GbE for fast inter-worker comms, 4× NVMe slots for future expandability.

**For cheap-and-fast proof-of-concept (one or two workers):** Beelink S12 Pro N100/16GB/500GB at ~$180-200. Lower power efficiency than ODROID-H5 but ships complete and ready, no sourcing-of-accessories friction. Acceptable for testing container isolation behaviors on x86_64 before committing to ODROID-H5 procurement at scale.

**Avoid:** LattePanda 3 Delta (soldered 8GB cap becomes a hard ceiling), Banana Pi BPI-M7 (couldn't verify specs/pricing — re-check later), ODROID-H4 family today (supply constrained).

**Defer arm64 (OPi 5 Plus, ROCK 5B) until/unless** you've scoped building the arm64 `universal`-equivalent devcontainer base image and want to commit to the dual-arch maintenance burden. The 2× 2.5GbE on OPi 5 Plus is tempting, but the migration cost dwarfs the per-worker cost saving.
