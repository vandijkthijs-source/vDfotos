"""Immich Sort progress companion. No photo mutations and no stored API keys."""
import json
from backup_status import status as backup_status
import os
import re
import sqlite3
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DB = Path(os.environ.get('SORT_DB', str(Path(__file__).with_name('progress.sqlite3'))))
IMMICH = os.environ.get('IMMICH_URL', 'http://127.0.0.1:2283').rstrip('/')
MAX_BODY = 16 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate(body):
    completed = body.get('completed', {})
    manual = body.get('manualWeeks', {})
    if not isinstance(completed, dict) or not isinstance(manual, dict):
        raise ValueError('Invalid progress')
    for asset_id, value in completed.items():
        if not isinstance(asset_id, str) or not 1 <= len(asset_id) <= 100 or not isinstance(value, dict):
            raise ValueError('Invalid asset')
        if value.get('kind') not in ('keep', 'trash') or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(value.get('week', ''))):
            raise ValueError('Invalid decision')
        if type(value.get('at')) not in (int, float) or not 0 <= value['at'] < 1e15:
            raise ValueError('Invalid timestamp')
        if value.get('albumId') is not None and not isinstance(value['albumId'], str):
            raise ValueError('Invalid album')
    for week, marked in manual.items():
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', week) or marked is not True:
            raise ValueError('Invalid week')
    resets = body.get('resetWeeks', {})
    if not isinstance(resets, dict): raise ValueError('Invalid resets')
    for week, at in resets.items():
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', week) or type(at) not in (int, float) or not 0 <= at < 1e15:
            raise ValueError('Invalid reset')
    return completed, manual, resets


def merge(user, body):
    completed, manual, resets = validate(body)
    DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB, timeout=15) as db:
        db.execute('CREATE TABLE IF NOT EXISTS progress (user TEXT PRIMARY KEY, value TEXT NOT NULL)')
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT value FROM progress WHERE user=?', (user,)).fetchone()
        saved = json.loads(row[0]) if row else {'completed': {}, 'manualWeeks': {}}
        for asset_id, value in completed.items():
            previous = saved['completed'].get(asset_id)
            if previous is None or value['at'] > previous['at']:
                saved['completed'][asset_id] = {k: value[k] for k in ('kind', 'week', 'at', 'albumId') if k in value}
        saved['manualWeeks'].update(manual)
        saved.setdefault('resetWeeks', {})
        for week, at in resets.items():
            saved['resetWeeks'][week] = max(at, saved['resetWeeks'].get(week, 0))
        db.execute('INSERT OR REPLACE INTO progress VALUES (?,?)', (user, json.dumps(saved)))
    return saved

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log credentials or request bodies.

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/backup-status':
            key = self.headers.get('x-api-key', '')
            if not key or len(key) > 4096:
                return self.reply(401, {'error': 'Immich API key required'})
            try:
                req = urllib.request.Request(IMMICH + '/api/users/me', headers={'x-api-key': key})
                with urllib.request.build_opener(NoRedirect).open(req, timeout=10) as response:
                    json.load(response)['id']
            except urllib.error.HTTPError:
                return self.reply(401, {'error': 'Immich authentication failed'})
            except Exception:
                return self.reply(503, {'error': 'Cannot verify account'})
            return self.reply(200, backup_status())
        self.reply(200 if self.path == '/health' else 404, {'service': 'immich-sort-sync', 'version': 1})

    def do_POST(self):
        if self.path != '/sync':
            return self.reply(404, {'error': 'Not found'})
        key = self.headers.get('x-api-key', '')
        if not key or len(key) > 4096:
            return self.reply(401, {'error': 'Immich API key required'})
        try:
            req = urllib.request.Request(IMMICH + '/api/users/me', headers={'x-api-key': key})
            with urllib.request.build_opener(NoRedirect).open(req, timeout=10) as response:
                user = json.load(response)['id']
        except urllib.error.HTTPError:
            return self.reply(401, {'error': 'Immich authentication failed; check user.read permission'})
        except Exception:
            return self.reply(503, {'error': 'Cannot verify your account with Immich'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BODY:
                return self.reply(413, {'error': 'Progress payload too large'})
            self.connection.settimeout(15)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError()
            saved = merge(user, body)
            self.reply(200, {'userId': user, **saved})
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Invalid progress payload'})
        except Exception:
            self.reply(500, {'error': 'Could not save progress; retry later'})

if __name__ == '__main__':
    os.umask(0o077)
    ThreadingHTTPServer((os.environ.get('SORT_HOST', '0.0.0.0'), int(os.environ.get('SORT_PORT', '2284'))), Handler).serve_forever()
