"""Serves the project and accepts trailer frames posted back by the page."""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = sys.argv[1]
OUT = sys.argv[2]
PORT = int(sys.argv[3])

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(length)

        if self.path.startswith('/frame/'):
            index = int(self.path.rsplit('/', 1)[-1])
            with open(os.path.join(OUT, f'f{index:05d}.png'), 'wb') as f:
                f.write(data)
        elif self.path == '/done':
            with open(os.path.join(OUT, 'DONE'), 'wb') as f:
                f.write(data or b'ok')

        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass  # the access log would be one line per frame

ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
