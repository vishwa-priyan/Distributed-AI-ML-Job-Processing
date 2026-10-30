# Intelligent Scheduling Strategies & Predictive ML

## 1. Overview
The platform decouples task assignment from task execution by utilizing a dedicated scheduling service (`scheduler/app/main.py`). The scheduler supports 4 interchangeable strategies that can be selected per job or configured globally.

---

## 2. Mathematical Formulations

### A. Round-Robin (`round_robin`)
Fair cyclical distribution across $N$ eligible workers:
$$\text{WorkerIndex} = i \pmod N$$
- **Time Complexity**: $O(1)$
- **Pros**: Perfectly balanced task count when tasks have identical execution times.
- **Cons**: Severe load imbalance when tasks or node hardware are heterogeneous.

### B. Least-Loaded (`least_loaded`)
Inspects active execution counts and assigns the task to the worker with the lowest concurrent load:
$$W^* = \arg\min_{w \in \mathcal{W}} (\text{ActiveTasks}_w)$$
- **Time Complexity**: $O(N)$
- **Pros**: Prevents pileup on a single worker.
- **Cons**: Ignores node capacity differences (e.g. 16-core server vs 4-core node).

### C. Resource-Aware Scheduling (`resource_aware`)
Evaluates genuine hardware metrics reported by worker heartbeats:
- $\text{CPU}_w$: Current CPU utilization percentage (0-100%).
- $\text{RAM}_w$: Percentage of RAM currently consumed.
- $\text{Slots}_w$: Active concurrency ratio $\frac{\text{ActiveTasks}_w}{\text{MaxSlots}_w} \times 100$.

The composite pressure score is defined as:
$$\text{Score}(w) = 0.40 \cdot \text{CPU}_w + 0.30 \cdot \text{RAM}_w + 0.30 \cdot \text{Slots}_w - \text{Bonus}_{\text{GPU}}$$
Where:
- Workers with $\text{ActiveTasks}_w \ge \text{MaxSlots}_w$ or `drain_mode = TRUE` are disqualified.
- An optional GPU affinity bonus ($-20.0$) is applied if the task requires image/tensor acceleration.
- The worker with the lowest score is selected:
$$W^* = \arg\min_{w \in \mathcal{W}_{\text{eligible}}} \text{Score}(w)$$

### D. Predictive Scheduling (`predictive`)
Uses a trained machine learning regression model (`HistGradientBoostingRegressor`) to estimate completion time:
$$\widehat{T}_{\text{total}}(w) = \widehat{T}_{\text{queue\_wait}}(w) + \widehat{T}_{\text{exec}}(w, X)$$

#### Input Feature Vector $X$:
1. `job_type_code`: Integer encoding of workload (1: inference, 2: preprocessing, 3: evaluation, 4: training, 5: image).
2. `record_count`: Number of rows in the batch chunk.
3. `batch_size`: Selected batch partitioning threshold.
4. `worker_cpu_cores`: Worker host logical cores count.
5. `worker_total_ram_mb`: Worker host total memory in megabytes.
6. `active_tasks`: Currently active jobs on the worker node.
7. `current_cpu_pct`: Current worker CPU utilization percentage.

#### Model Evaluation vs Baseline:
- Baseline Mean DummyRegressor: $\text{MAE} = 17.68\text{s}$, $\text{RMSE} = 28.03\text{s}$.
- Candidate HistGradientBoostingRegressor: $\text{MAE} = 1.34\text{s}$ (**92.4% error reduction**), $\text{RMSE} = 3.16\text{s}$, $R^2 = 0.9873$.
- **Deterministic Fallback**: If the prediction model is missing or features are incomplete, the scheduler automatically invokes `ResourceAwareStrategy`.
