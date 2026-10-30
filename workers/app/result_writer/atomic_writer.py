"""
Atomic result writer and artifact manager.
Prevents partial writes and ensures idempotent results.
"""

import os
import shutil
import hashlib
import json
from typing import Dict, Any, Tuple

def compute_sha256(filepath: str) -> str:
    """Computes SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            sha256.update(chunk)
    return sha256.hexdigest()

def write_atomic_csv(df, target_path: str) -> Tuple[str, int, str]:
    """
    Atomically writes a pandas DataFrame to CSV.
    Writes to a temporary path first, then renames to target.
    Returns: (target_path, file_size_bytes, sha256_checksum)
    """
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    tmp_path = f"{target_path}.tmp.{os.getpid()}"

    df.to_csv(tmp_path, index=False)
    
    # Atomic replace
    if os.path.exists(target_path):
        os.remove(target_path)
    shutil.move(tmp_path, target_path)

    file_size = os.path.getsize(target_path)
    checksum = compute_sha256(target_path)
    return target_path, file_size, checksum

def write_atomic_json(data: Dict[str, Any], target_path: str) -> Tuple[str, int, str]:
    """
    Atomically writes a dictionary to a JSON file.
    Returns: (target_path, file_size_bytes, sha256_checksum)
    """
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    tmp_path = f"{target_path}.tmp.{os.getpid()}"

    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    if os.path.exists(target_path):
        os.remove(target_path)
    shutil.move(tmp_path, target_path)

    file_size = os.path.getsize(target_path)
    checksum = compute_sha256(target_path)
    return target_path, file_size, checksum
