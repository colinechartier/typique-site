# -*- coding: utf-8 -*-
"""Captures de la partie 3 de la page (l'animation à 4 diapositives : tee-shirts, manches longues, hoodies, accessoires),
sur téléphone (390 px) et sur ordinateur (1440 px), pour regarder les photos. Rien n'est envoyé nulle part : serveur local.

  python3 tools/capture_showcase.py [dossier de sortie]
"""
import http.server, os, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome

PORT, CDP_PORT = 8096, 9336
sortie = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="typique-showcase-")
os.makedirs(sortie, exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
c = Chrome(tempfile.mkdtemp(prefix="typique-chrome-showcase-"), port=CDP_PORT)
try:
    for dom in ("Page", "Runtime"):
        c.call(dom + ".enable")
    for nom, w, h, mobile, dpr in (("mobile", 390, 844, True, 2), ("ordinateur", 1440, 900, False, 1)):
        c.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=dpr, mobile=mobile)
        c.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/apercu/")
        assert c.wait("!!document.querySelector('.showcase-track')", 40), "animation introuvable"
        time.sleep(2)
        for i in range(4):
            c.js("(() => { const t = document.querySelector('.showcase-track'); const r = t.getBoundingClientRect();"
                 " const max = t.offsetHeight - window.innerHeight;"
                 " window.scrollTo(0, window.scrollY + r.top + max * (%d + 0.5) / 4); })()" % i)
            time.sleep(1.8)
            c.shot(os.path.join(sortie, "%s_%d.png" % (nom, i + 1)))
            print(nom, i + 1, flush=True)
finally:
    c.close()
    srv.shutdown()
print("Captures dans", sortie)
