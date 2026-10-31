"""Test du paiement en local, drop forcé ouvert. Le dépôt n'est pas modifié : un petit serveur
sur http://127.0.0.1:8091/ corrige app.js à la volée. Rien n'est payé : le test s'arrête sur la page Shopify.

  python3 tools/test_paiement.py                    # Le Ferret en M, jusqu'à la page de paiement
  python3 tools/test_paiement.py "Le Mistral|XXL|HOODIES" "La Garrigue|Taille unique|ACCESSOIRES"
  python3 tools/test_paiement.py --serveur          # le site seul, drop ouvert, pour un test à la main

Onglets : T-SHIRTS, MANCHES LONGUES, HOODIES, ACCESSOIRES.
"""
import http.server, json, os, re, sys, tempfile, threading, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome, WS

PORT, CDP_PORT = 8091, 9334
FIN_DROP_1 = "2026-06-15T00:01:00"  # à adapter quand les dates du drop sortiront du code (bloc 2)
app = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
assert app.count(FIN_DROP_1) == 1, "date de fin du drop 1 introuvable dans app.js"
APP_OUVERT = app.replace(FIN_DROP_1, "2099-12-31T23:59:00").encode()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/app.js":
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(APP_OUVERT)))
            self.end_headers()
            self.wfile.write(APP_OUVERT)
            return
        super().do_GET()


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
if sys.argv[1:] == ["--serveur"]:
    print(f"Site avec le drop ouvert : http://127.0.0.1:{PORT}/apercu/ (Ctrl+C pour arrêter)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)

threading.Thread(target=srv.serve_forever, daemon=True).start()
ITEMS = [a.split("|") for a in sys.argv[1:]] or [["Le Ferret", "M", "T-SHIRTS"]]
profil = tempfile.mkdtemp(prefix="typique-test-paiement-")
c = Chrome(profil, port=CDP_PORT)


def js(expr):
    try:
        return c.js(expr)
    except Exception as e:  # page en cours de navigation
        return f"__erreur__ {e}"


def attendre(expr, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = js(expr)
        if v and not (isinstance(v, str) and v.startswith("__erreur__")):
            return v
        time.sleep(0.3)
    return None


def onglet():
    return [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json")) if t["type"] == "page"][0]


def masque(url):  # l'identifiant du panier n'a pas à s'afficher
    return re.sub(r"(/c[ns]/)[^/?]+", r"\1<panier>", url.split("?")[0])


try:
    for dom in ("Page", "Runtime", "Network"):
        c.call(f"{dom}.enable")
    ua = c.js("navigator.userAgent").replace("HeadlessChrome", "Chrome")
    c.call("Network.setUserAgentOverride", userAgent=ua, acceptLanguage="fr-FR,fr")
    c.call("Emulation.setDeviceMetricsOverride", width=1280, height=1700, deviceScaleFactor=1, mobile=False)
    c.call("Page.addScriptToEvaluateOnNewDocument", source=(
        "if (location.hostname === '127.0.0.1') { window.__alertes = [];"
        " window.alert = m => window.__alertes.push(String(m)); }"))
    c.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/apercu/")

    B = "[...document.querySelectorAll('button')]"
    for piece, taille, cat in ITEMS:
        assert attendre(f"{B}.some(b => b.textContent.trim().toUpperCase() === '{cat}')"), f"onglet {cat} introuvable"
        js(f"{B}.find(b => b.textContent.trim().toUpperCase() === '{cat}').click()")
        time.sleep(1)
        carte = (f"(() => {{ for (const b of {B}.filter(b => b.textContent.trim() === '+ Panier')) {{"
                 f" let el = b; while (el && !el.textContent.includes({json.dumps(piece)})) el = el.parentElement;"
                 f" if (el && [...el.querySelectorAll('button')].filter(x => x.textContent.trim() === '+ Panier').length === 1) return el; }} }})()")
        assert attendre(f"!!{carte}", 20), f"carte {piece} avec bouton « + Panier » introuvable"
        if taille != "Taille unique":
            js(f"[...{carte}.querySelectorAll('button')].find(x => x.textContent.trim() === {json.dumps(taille)}).click()")
            time.sleep(0.5)
        js(f"[...{carte}.querySelectorAll('button')].find(x => x.textContent.trim() === '+ Panier').click()")
        time.sleep(0.8)
    assert attendre(f"{B}.some(b => b.textContent.includes('Commander'))", 10), "panier non ouvert"
    print("PANIER DU SITE :", js(f"(() => {{ let el = {B}.find(b => b.textContent.includes('Commander'));"
                                 f" while (el && !el.textContent.includes({json.dumps(ITEMS[0][0])})) el = el.parentElement;"
                                 f" return el ? el.innerText.replace(/\\s+/g, ' ') : '?'; }})()"))
    t0 = time.time()
    js(f"{B}.find(b => b.textContent.includes('Commander')).click()")
    url = None
    for _ in range(200):
        if not onglet()["url"].startswith("http://127.0.0.1"):
            url = onglet()["url"]
            break
        time.sleep(0.3)
    if not url:
        print("ÉCHEC : pas de redirection vers Shopify. Alertes du site :", js("window.__alertes"))
        sys.exit(1)
    print(f"REDIRECTION en {time.time() - t0:.1f} s vers :", masque(url))
    time.sleep(2)
    try:
        c.js("1")
    except Exception:  # la liaison avec Chrome peut sauter pendant la redirection
        c.ws = WS(onglet()["webSocketDebuggerUrl"])
        c.call("Runtime.enable")
    noms = json.dumps([it[0] for it in ITEMS])
    attendre(f"document.body && {noms}.every(n => document.body.innerText.includes(n)) && document.readyState === 'complete'", 60)
    time.sleep(3)
    texte = js("document.body.innerText.replace(/\\s+/g, ' ')") or ""
    i = texte.find("Résumé de la commande")
    print("RÉSUMÉ SHOPIFY :", texte[i:i + 700] if i >= 0 else texte[:1500])
    c.shot(os.path.join(profil, "paiement.png"))
    print("Capture :", os.path.join(profil, "paiement.png"))
    print("APPELS SHOPIFY :")
    for e in c.events:
        if e.get("method") == "Network.responseReceived":
            r = e["params"]["response"]
            if "/api/" in r["url"] and "graphql" in r["url"] or "buy-button" in r["url"]:
                h = {k.lower(): v for k, v in r.get("headers", {}).items()}
                print(" ", r["status"], r["url"].split("?")[0], "· version servie :", h.get("x-shopify-api-version", "-"))
    erreurs = [e["params"]["exceptionDetails"].get("exception", {}).get("description", e["params"]["exceptionDetails"].get("text"))
               for e in c.events if e.get("method") == "Runtime.exceptionThrown"]
    print("ERREURS JS (site et page Shopify) :", erreurs[:5] or "aucune")
finally:
    c.close()
    srv.shutdown()
