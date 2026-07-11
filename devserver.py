#!/usr/bin/env python3
# Serveur de dev K-Arise, multi-plateforme (Windows / macOS / Linux).
# Sert le dossier en no-cache (le code se recharge a jour a chaque refresh) et ouvre le navigateur.
import http.server
import socketserver
import os
import sys
import threading
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # silencieux


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    url = f"http://localhost:{PORT}"
    try:
        httpd = Server(("", PORT), Handler)
    except OSError:
        print(f"Le port {PORT} est deja utilise. K-Arise tourne peut-etre deja : ouvre {url}")
        sys.exit(1)
    print(f"K-Arise dev server sur {url}  (Ctrl+C pour arreter)")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArret du serveur.")
        httpd.shutdown()


if __name__ == "__main__":
    main()
