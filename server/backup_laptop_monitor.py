"""Aggregate-only status command installed on the backup laptop."""
import json
import os
import time
from pathlib import Path

MEDIA = {
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif',
    '.dng', '.raw', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2',
    '.pef', '.srw', '.tif', '.tiff', '.bmp', '.mp4', '.mov', '.avi', '.mkv',
    '.webm', '.m4v', '.3gp', '.mts', '.m2ts', '.mpg', '.mpeg',
}


def measure_folders(folders):
    count = size = 0
    for folder in folders:
        if not folder.is_dir():
            continue
        def fail(error):
            raise error
        for directory, _, filenames in os.walk(folder, onerror=fail, followlinks=False):
            for filename in filenames:
                path = Path(directory) / filename
                if path.suffix.lower() not in MEDIA or path.is_symlink():
                    continue
                stat = path.stat()
                count += 1
                size += stat.st_size
    return count, size


def measure(root, history):
    if not (root / 'upload').is_dir() or not (root / 'library').is_dir():
        raise OSError('Original media folders are unavailable')
    current_files, current_bytes = measure_folders([root / 'upload', root / 'library'])
    history_folders = []
    for snapshot in history.iterdir():
        if snapshot.is_dir() and not snapshot.name.endswith('-baseline'):
            history_folders.extend((snapshot / 'upload', snapshot / 'library'))
    recoverable_files, recoverable_bytes = measure_folders(history_folders)
    return {
        'files': current_files,
        'bytes': current_bytes,
        'recoverableFiles': recoverable_files,
        'recoverableBytes': recoverable_bytes,
        'measuredAt': time.time() * 1000,
    }


if __name__ == '__main__':
    base = Path('/home/thijs/Immich-Backup')
    print(json.dumps(measure(base / 'mirror', base / 'history')))
