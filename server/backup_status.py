"""Read-only original-media measurements; never starts or changes a backup."""
import json
import os
import subprocess
import threading
import time
from pathlib import Path

MEDIA = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif', '.dng', '.raw', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2', '.pef', '.srw', '.tif', '.tiff', '.bmp', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp', '.mts', '.m2ts', '.mpg', '.mpeg'}
_lock = threading.Lock()
_cached = None
_cached_at = 0


def measure(root):
    root = Path(root)
    count = size = 0
    # Immich keeps originals in upload/ and library/. Exclude generated media.
    for name in ('upload', 'library'):
        folder = root / name
        if not folder.is_dir():
            raise OSError('Original media folder unavailable')
        def fail(error):
            raise error
        for directory, _, files in os.walk(folder, onerror=fail, followlinks=False):
            for name in files:
                path = Path(directory) / name
                if path.suffix.lower() not in MEDIA or path.is_symlink():
                    continue
                stat = path.stat()
                count += 1
                size += stat.st_size
    return {'files': count, 'bytes': size, 'measuredAt': time.time() * 1000}


def parse_measurement(raw):
    try:
        value = json.loads(raw)
        for field in ('files', 'bytes', 'measuredAt'):
            if type(value.get(field)) not in (int, float) or not 0 <= value[field] < 1e16:
                raise ValueError('Invalid measurement')
        if value['measuredAt'] > time.time() * 1000 + 60000:
            raise ValueError('Future measurement')
        return {key: value[key] for key in ('files', 'bytes', 'measuredAt')}
    except (OSError, ValueError, TypeError):
        return None


def read_backup(path):
    try:
        return parse_measurement(Path(path).read_text())
    except OSError:
        return None


def remote_backup():
    try:
        result = subprocess.run([
            "ssh", "-i", os.environ.get("PHOTO_MONITOR_KEY", str(Path.home() / ".ssh/immich_monitor")),
            "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=4", "thijs@192.168.68.117", "photo-status",
        ], capture_output=True, text=True, timeout=12, check=True)
        return parse_measurement(result.stdout)
    except (OSError, subprocess.SubprocessError):
        return None


def status():
    global _cached, _cached_at
    with _lock:
        if _cached is not None and time.monotonic() - _cached_at < 60:
            return _cached
        try:
            primary = measure(os.environ.get('PHOTO_LIBRARY_ROOT', '/home/thijs/immich-library'))
        except OSError:
            primary = None
        backup = remote_backup() or read_backup(os.environ.get('PHOTO_BACKUP_STATUS', str(Path(__file__).with_name('data') / 'backup-status.json')))
        if backup is None and _cached is not None:
            backup = _cached['backup']
        _cached = {'primary': primary, 'backup': backup, 'checkedAt': time.time() * 1000}
        _cached_at = time.monotonic()
        return _cached


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Measure an Immich media copy without modifying it.')
    parser.add_argument('root', help='Directory containing upload/ and library/')
    args = parser.parse_args()
    print(json.dumps(measure(args.root)))
