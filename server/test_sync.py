import io
import json
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path
import sync_server as service

class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        service.DB = Path(self.temp.name) / 'progress.db'
    def tearDown(self):
        self.temp.cleanup()
    def test_merge_and_isolation(self):
        old = {'kind': 'keep', 'week': '2026-10-19', 'at': 1}
        new = {**old, 'kind': 'trash', 'at': 2}
        service.merge('alice', {'completed': {'photo': new}})
        result = service.merge('alice', {'completed': {'photo': old, 'another': old}, 'manualWeeks': {'2026-10-12': True}})
        self.assertEqual(result['completed']['photo']['kind'], 'trash')
        self.assertEqual(len(result['completed']), 2)
        self.assertEqual(service.merge('bob', {})['completed'], {})
        self.assertTrue(service.merge('alice', {})['manualWeeks']['2026-10-12'])
    def test_handler_uses_authenticated_identity_not_body_user(self):
        class Auth:
            def open(self, req, timeout):
                self.key = req.get_header('X-api-key')
                return io.BytesIO(json.dumps({'id': 'authenticated-user'}).encode())
        class Request:
            path = '/sync'
            data = json.dumps({'userId': 'forged-user', 'completed': {'photo': {'kind': 'keep', 'week': '2026-10-19', 'at': 1}}}).encode()
            headers = {'x-api-key': 'test-only', 'Content-Length': str(len(data))}
            rfile = io.BytesIO(data)
            class connection:
                @staticmethod
                def settimeout(value): pass
            def reply(self, status, body): self.result = (status, body)
        request = Request()
        with patch.object(service.urllib.request, 'build_opener', return_value=Auth()):
            service.Handler.do_POST(request)
        self.assertEqual(request.result[0], 200)
        self.assertEqual(request.result[1]['userId'], 'authenticated-user')
        self.assertEqual(service.merge('forged-user', {})['completed'], {})

    def test_reset_survives_stale_client(self):
        week = '2026-10-19'
        service.merge('alice', {'resetWeeks': {week: 100}})
        result = service.merge('alice', {'resetWeeks': {week: 10}, 'manualWeeks': {week: True}})
        self.assertEqual(result['resetWeeks'][week], 100)
        self.assertEqual(service.merge('bob', {})['resetWeeks'], {})

    def test_reject_invalid(self):
        with self.assertRaises(ValueError):
            service.merge('alice', {'completed': {'bad': {'kind': 'delete', 'week': 'bad', 'at': 0}}})
        self.assertEqual(service.merge('alice', {})['completed'], {})

if __name__ == '__main__':
    unittest.main()
