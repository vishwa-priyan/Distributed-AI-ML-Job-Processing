"""
Local standalone Redis server using fakeredis TCP server.
Allows full Windows local execution of Redis-dependent services (Celery, Node.js, Scheduler)
without requiring Docker Desktop or WSL setup.
If port 6379 is already open (e.g. running external Redis container or service), it reports it and keeps running.
"""

import sys
import os
import socket
import logging
import signal
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [RedisServer] %(message)s'
)
logger = logging.getLogger("RedisServer")

def is_port_in_use(port: int, host: str = '127.0.0.1') -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def main():
    port = int(os.environ.get('REDIS_PORT', 6379))
    host = os.environ.get('REDIS_HOST', '0.0.0.0')

    if is_port_in_use(port, '127.0.0.1'):
        logger.info(f"Port {port} is already in use by an active Redis service. Monitoring existing Redis...")
        try:
            while True:
                time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Exiting monitor.")
            return

    try:
        import fakeredis
        logger.info(f"Starting standalone Redis TCP Server on {host}:{port} (LAN accessible)...")
        server = fakeredis.TcpFakeServer((host, port))
        
        def handle_exit(signum, frame):
            logger.info("Shutting down Redis TCP Server...")
            server.server_close()
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_exit)
        signal.signal(signal.SIGTERM, handle_exit)
        
        logger.info(f"[OK] Redis TCP Server listening on {host}:{port}")
        server.serve_forever()
    except Exception as e:
        logger.error(f"Error starting Redis server: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
