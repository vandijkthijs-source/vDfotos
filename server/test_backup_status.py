import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import backup_status as b

class BackupTests(unittest.TestCase):
    def test_counts_originals_excludes_generated_sidecars_and_links(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('upload', 'library', 'thumbs'): (root / name).mkdir()
            (root / 'upload/a.JPG').write_bytes(b'123')
            (root / 'library/b.mp4').write_bytes(b'12345')
            (root / 'upload/a.xmp').write_bytes(b'ignored')
            (root / 'thumbs/a.jpg').write_bytes(b'ignored')
            (root / 'upload/link.jpg').symlink_to(root / 'upload/a.JPG')
            result = b.measure(root)
            self.assertEqual((result['files'], result['bytes']), (2, 8))
    def test_missing_root_is_not_empty_backup(self):
        with self.assertRaises(OSError): b.measure('/nonexistent/immich')
    def test_invalid_measurements_rejected(self):
        for value in ({}, {'files': True, 'bytes': 0, 'measuredAt': 0}, {'files': 0, 'bytes': -1, 'measuredAt': 0}, {'files': 0, 'bytes': 0, 'measuredAt': time.time()*1000+120000}):
            self.assertIsNone(b.parse_measurement(json.dumps(value)))
    def test_retains_timestamp_when_remote_unreachable(self):
        old = {'files': 1, 'bytes': 10, 'measuredAt': 1}
        with patch.object(b, '_cached', {'backup': old}), patch.object(b, '_cached_at', 0), patch.object(b, 'remote_backup', return_value=None), patch.object(b, 'read_backup', return_value=None), patch.object(b, 'measure', return_value=None):
            self.assertEqual(b.status()['backup'], old)

class EndpointTests(unittest.TestCase):
    def test_endpoint_rejects_missing_key(self):
        import sync_server
        class Request:
            path = '/backup-status'
            headers = {}
            def reply(self, status, body): self.result = status
        request = Request()
        sync_server.Handler.do_GET(request)
        self.assertEqual(request.result, 401)
    def test_endpoint_authenticates_before_reading_measurements(self):
        import io
        import sync_server
        class Auth:
            def open(self, req, timeout): return io.BytesIO(b'{"id":"alice"}')
        class Request:
            path = '/backup-status'
            headers = {'x-api-key': 'test-only'}
            def reply(self, status, body): self.result = (status, body)
        request = Request()
        with patch.object(sync_server.urllib.request, 'build_opener', return_value=Auth()), patch.object(sync_server, 'backup_status', return_value={'primary': None, 'backup': None}):
            sync_server.Handler.do_GET(request)
        self.assertEqual(request.result, (200, {
            'primary': None,
            'backup': None,
            'library': {'active': None, 'trashed': None},
        }))

if __name__ == '__main__': unittest.main()
