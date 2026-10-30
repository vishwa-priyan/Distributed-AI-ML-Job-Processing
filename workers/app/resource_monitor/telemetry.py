"""
System resource telemetry collector using psutil.
Provides genuine, non-mocked hardware metrics for workers.
"""

import os
import psutil
from typing import Dict, Any

def get_system_metrics() -> Dict[str, Any]:
    """
    Returns real hardware metrics for the current worker host and process.
    """
    cpu_percent = psutil.cpu_percent(interval=0.1)
    cpu_cores = psutil.cpu_count(logical=True) or 4
    
    virtual_mem = psutil.virtual_memory()
    total_ram_mb = round(virtual_mem.total / (1024 * 1024), 2)
    available_ram_mb = round(virtual_mem.available / (1024 * 1024), 2)
    memory_percent = virtual_mem.percent

    current_proc = psutil.Process(os.getpid())
    proc_memory_mb = round(current_proc.memory_info().rss / (1024 * 1024), 2)
    proc_cpu_percent = current_proc.cpu_percent(interval=None)

    has_gpu = False
    gpu_name = None
    try:
        import torch
        if torch.cuda.is_available():
            has_gpu = True
            gpu_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

    return {
        "cpu_percent": cpu_percent,
        "cpu_cores": cpu_cores,
        "total_ram_mb": total_ram_mb,
        "available_ram_mb": available_ram_mb,
        "memory_percent": memory_percent,
        "proc_memory_mb": proc_memory_mb,
        "proc_cpu_percent": proc_cpu_percent,
        "has_gpu": has_gpu,
        "gpu_name": gpu_name
    }
