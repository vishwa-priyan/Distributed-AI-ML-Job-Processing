# Performance Benchmarking Methodology

## 1. Benchmarking Equations

### Speedup $S(N)$
Measures relative performance improvement when running workload across $N$ worker nodes versus a single-worker baseline:
$$S(N) = \frac{T(1)}{T(N)}$$
Where:
- $T(1)$ is the measured wall-clock execution time with 1 worker.
- $T(N)$ is the measured wall-clock execution time with $N$ distributed workers.

### Parallel Efficiency $E(N)$
Quantifies how effectively hardware concurrency is utilized:
$$E(N) = \frac{S(N)}{N} \times 100\%$$
- Linear ideal scaling: $E(N) = 100\%$.
- Sub-linear scaling accounts for scheduling latency, network transfer, and batch aggregation overhead.

---

## 2. Benchmark Reproduction Commands

Execute the automated benchmark suite:
```bash
python scripts/benchmark.py
```
This runs trials for:
- Round-Robin
- Least-Loaded
- Resource-Aware
- Predictive Scheduling

Outputs are exported directly to:
- `benchmark_results.csv`
- `benchmark_results.json`
