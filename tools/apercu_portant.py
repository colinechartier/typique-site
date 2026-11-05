"""Aperçu du site tel qu'il est dans ce dossier, avec le drop déjà ouvert, pour le Mac et l'iPhone (même Wi-Fi).
Rien n'est en ligne, mais les boutons sont les vrais : on peut aller jusqu'à la page de paiement Shopify, sans payer.
Seuls les fichiers publics sont servis. À relancer après chaque `python3 tools/build.py`.
Usage : python3 tools/apercu_portant.py   (Ctrl+C pour arrêter)
"""
import http.server, os, re, shutil, socket, socketserver, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8098
DOSSIER = tempfile.mkdtemp()
for nom in ("boutique.css", "favicon.ico", "icon-192.png", "apple-touch-icon.png", "legal", "photos", "media", "vendor"):
    if os.path.exists(os.path.join(ROOT, nom)):
        os.symlink(os.path.join(ROOT, nom), os.path.join(DOSSIER, nom))
os.makedirs(os.path.join(DOSSIER, "apercu"))
shutil.copy(os.path.join(ROOT, "apercu", "index.html"), os.path.join(DOSSIER, "apercu", "index.html"))

# Dans cette copie seulement : l'ouverture est dans le passé, la boutique est donc ouverte pour de vrai.
code = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
code, n = re.subn(r'"ouverture":"[^"]+"', '"ouverture":"2026-01-01T12:00:00+01:00"', code, count=1)
assert n == 1, "date d'ouverture introuvable dans app.js"
open(os.path.join(DOSSIER, "app.js"), "w", encoding="utf-8").write(code)


class Silence(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DOSSIER, **k)
    def log_message(self, *a): pass


class Serveur(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sonde:
    sonde.connect(("192.0.2.1", 9))  # aucun paquet n'est envoyé : sert à connaître l'adresse du Mac sur le Wi-Fi
    ip = sonde.getsockname()[0]
print(f"Sur le Mac et sur l'iPhone (même Wi-Fi) : http://{ip}:{PORT}/apercu/#pieces", flush=True)
print("Ne pas payer. Ctrl+C pour arrêter.", flush=True)
try:
    Serveur(("", PORT), Silence).serve_forever()
except KeyboardInterrupt:
    pass
finally:
    shutil.rmtree(DOSSIER, ignore_errors=True)
