"""
Distributed cluster file synchronizer.
Enables seamless execution across physical worker machines without requiring shared network SMB/NFS folders.
Automatically pulls input batch chunks from master over HTTP and pushes results back to master.
"""

import os
import logging
import urllib.request
import urllib.error

logger = logging.getLogger("WorkerSync")

def get_master_host() -> str:
    """Extracts master IP or hostname from environment configuration."""
    master_host = os.environ.get("MASTER_HOST")
    if master_host:
        return master_host.strip()

    redis_url = os.environ.get("REDIS_URL", "")
    if "@" in redis_url:
        host_part = redis_url.split("@")[-1].split(":")[0]
        if host_part and host_part not in ["localhost", "127.0.0.1"]:
            return host_part
    elif "redis://" in redis_url:
        host_part = redis_url.replace("redis://", "").split(":")[0].split("/")[0]
        if host_part and host_part not in ["localhost", "127.0.0.1"]:
            return host_part

    db_url = os.environ.get("DATABASE_URL", "")
    if "@" in db_url:
        host_part = db_url.split("@")[-1].split(":")[0].split("/")[0]
        if host_part and host_part not in ["localhost", "127.0.0.1"]:
            return host_part

    return "127.0.0.1"

def is_remote_worker() -> bool:
    host = get_master_host()
    return host not in ["127.0.0.1", "localhost", ""]

def ensure_file_present(local_path: str, category: str = "batches") -> str:
    """
    Checks if a required input file exists locally.
    If not and running as a remote worker, downloads it from the master node over HTTP.
    """
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return local_path

    master_host = get_master_host()
    if not is_remote_worker():
        return local_path

    filename = os.path.basename(local_path)
    api_port = os.environ.get("MASTER_API_PORT", "5000")
    download_url = f"http://{master_host}:{api_port}/api/v1/internal/storage/{category}/{filename}"

    os.makedirs(os.path.dirname(os.path.abspath(local_path)), exist_ok=True)
    logger.info(f"Downloading missing {category} file from master node: {download_url} -> {local_path}")

    try:
        urllib.request.urlretrieve(download_url, local_path)
        if os.path.exists(local_path):
            file_size = os.path.getsize(local_path)
            logger.info(f"[OK] Successfully downloaded {filename} ({file_size} bytes)")
            return local_path
    except Exception as e:
        logger.error(f"[ERROR] Failed to download {filename} from master node ({download_url}): {e}")

    return local_path

def sync_result_to_master(local_path: str, category: str = "batches") -> bool:
    """
    If running as a remote worker, uploads the finished result file back to the master node.
    """
    if not os.path.exists(local_path):
        logger.warning(f"Result file to sync does not exist locally: {local_path}")
        return False

    if not is_remote_worker():
        return True

    master_host = get_master_host()
    filename = os.path.basename(local_path)
    api_port = os.environ.get("MASTER_API_PORT", "5000")
    upload_url = f"http://{master_host}:{api_port}/api/v1/internal/storage/{category}/{filename}"

    logger.info(f"Syncing completed result file to master: {local_path} -> {upload_url}")

    try:
        with open(local_path, "rb") as f:
            data = f.read()

        req = urllib.request.Request(
            upload_url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/octet-stream"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                logger.info(f"[OK] Successfully synced result {filename} to master node.")
                return True
            else:
                logger.error(f"[ERROR] Master responded with HTTP status {resp.status} during result sync")
    except Exception as e:
        logger.error(f"[ERROR] Failed to sync result {filename} to master node ({upload_url}): {e}")

    return False

