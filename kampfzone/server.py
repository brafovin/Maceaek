#!/usr/bin/env python3
"""Startet einen kleinen Webserver für Kampfzone – ohne Browser-Cache, damit Änderungen sofort sichtbar sind.

    python3 kampfzone/server.py          (Port 8000)
    python3 kampfzone/server.py 8080     (anderer Port)

Danach http://localhost:8000/kampfzone/ im Browser öffnen.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # Repo-Verzeichnis (wegen ../vendor)


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'Kampfzone läuft: http://localhost:{port}/kampfzone/   (Strg+C beendet)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
