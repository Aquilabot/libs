---
title: Run the benchmark
description: Use bench/bench.sh to measure single-PDF latency and combined-report time per concurrency level against a running stack.
---

`bench/bench.sh` takes rough latency numbers against a running stack. It uses `curl`, `awk`, `sed`, `sort`, `lscpu` and `nproc`, so it expects a Linux shell.

## Run it

Start the stack, then run the script from the repository root:

```bash
docker compose up --build -d
bench/bench.sh
```

Arguments and environment:

| Input | Default | Meaning |
|---|---|---|
| First argument | `http://localhost:8080` | Base URL of the application |
| Second argument | `24` | Number of accounts in each combined report |
| `RUNS` environment variable | `5` | Combined-report runs per concurrency level |

```bash
RUNS=3 bench/bench.sh http://localhost:8080 48
```

## What it measures

1. The CPU model and thread count, from `lscpu` and `nproc`.
2. Single statement PDF: 5 warm-up requests to `GET /api/reports/statement/3`, then 30 measured requests. It prints the median and p95 of curl's `time_total`, in seconds.
3. Combined report: one warm-up job with 4 accounts, then `RUNS` jobs at each concurrency level 1, 2, 4, 6 and 8. It reads `elapsedMillis` from the `done` event, so these are server-side times, and prints a Markdown table with the median and every run.
4. Mean Gotenberg call time since the application started, for `convert-html` and `merge`, from `/actuator/metrics/gotenberg.requests` with `outcome:success`.

The highest level, 8, equals the default `reports.combined.max-concurrency`. If you lower that property, the levels above it fail validation in `CombinedReportService.start`.

## Published results

The README reports one set of measurements. Its conditions: `bench/bench.sh` against `docker compose up` on one machine, an AMD Ryzen 7 5800X3D (8 cores, 16 threads) with 125 GB RAM, Docker 29.9.1, Gotenberg 8.32.0 with its defaults (`--chromium-max-concurrency=6`, Chromium restarted every 100 conversions). The application and Gotenberg share the machine. The README says to treat the figures as orders of magnitude, not a benchmark.

Single statement PDF (3 pages), 30 sequential requests after warm-up: median 0.20 s, p95 0.32 s. An earlier run of the same script gave a median of 0.14 s.

Combined report with 24 statements plus a summary (25 sections, 83 pages, 1.2 MB), median of 5 runs:

| Concurrency | Median | Runs (ms) |
|---|---|---|
| 1 | 3.65 s | 3970 4030 3654 3585 3636 |
| 2 | 2.12 s | 2370 2121 2061 2114 2315 |
| 4 | 1.43 s | 1429 1293 1490 1653 1397 |
| 6 | 1.33 s | 1228 1265 1492 1396 1332 |
| 8 | 1.38 s | 1378 1514 1170 1393 1274 |

Over that session the mean HTML conversion took 233 ms and the mean merge 37 ms. One run with 200 accounts at concurrency 6 produced 684 pages (9.3 MB) in 11.8 s.

## Reading the numbers

The README's interpretation: parallelism pays off up to about 4 concurrent sections and flattens at 6, which is Gotenberg's Chromium limit. Past that, requests queue inside Gotenberg. To go faster, run more Gotenberg replicas rather than more threads. Runs with the same setting differ by about 30% (1170 to 1514 ms at concurrency 8), and the cause was not investigated.

Each section embeds its own font subset, so a merged PDF carries the fonts once per section. The README notes that this is a large share of the 1.2 MB for 83 pages.
