#!/usr/bin/env python3
"""
Development server for Hack the Dice.

The same thing as `python3 -m http.server`, except it tells the browser not to
cache anything. That matters here: the game is ES modules, and a browser that
holds on to half of them while loading the other half fresh will fail with a
missing-export error and a blank screen. No cache, no mystery.

    python3 tools/serve.py [port]        # defaults to 8000
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    print(f'Hack the Dice — http://localhost:{PORT}/  (caching off, ctrl-c to stop)')
    ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
