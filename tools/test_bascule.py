"""Test de la bascule attente → boutique → attente, en local. Rien n'est payé ni publié.

  python3 tools/test_bascule.py                # tous les scénarios (environ 2 minutes)
  python3 tools/test_bascule.py "serveur"      # seulement ceux dont le nom contient « serveur »
  python3 tools/test_bascule.py --serveur      # le site seul, avec un faux serveur réglable, pour un essai à la main

Un petit serveur sur http://127.0.0.1:8092/ sert le dépôt et fait office de /api/heure (comme api/heure.js en ligne).
Son heure se règle (décalage, fonction absente ou muette) pour vérifier que l'accueil suit l'heure du serveur et pas celle de
l'appareil. L'heure de l'appareil est truquée dans Chrome. Les heures du site (?simuler=) sont lues dans reglage-drop.ini.
Le test reconstruit le site en mode « automatique » (et en « attente » et « boutique » pour le secours), puis remet le mode du dépôt.
"""
import http.server, json, os, re, subprocess, sys, tempfile, threading, time, urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome

PORT, CDP_PORT = 8092, 9335
serveur = {"decalage": 0.0, "api": "ok"}  # décalage de l'heure du faux serveur (s) ; api : ok | absente | muette


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def date_time_string(self, timestamp=None):  # l'en-tête « Date » suit l'heure du faux serveur
        return super().date_time_string(time.time() + serveur["decalage"] if timestamp is None else timestamp)

    def _muet(self):
        self.close_connection = True
        self.connection.close()

    def do_HEAD(self):
        if serveur["api"] == "muette":
            return self._muet()
        super().do_HEAD()

    def do_GET(self):
        chemin = urllib.parse.urlparse(self.path)
        if chemin.path == "/__serveur":  # réglage depuis le test : ?decalage=3600&api=muette
            for k, v in urllib.parse.parse_qsl(chemin.query):
                serveur[k] = float(v) if k == "decalage" else v
            return self._json({"ok": True})
        if chemin.path == "/api/heure":
            if serveur["api"] == "muette":
                return self._muet()
            if serveur["api"] == "absente":
                return self.send_error(404)
            return self._json({"t": int((time.time() + serveur["decalage"]) * 1000)})
        super().do_GET()

    def _json(self, data):
        corps = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)


srv = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), H)
if sys.argv[1:] == ["--serveur"]:
    print(f"Site de test : http://127.0.0.1:{PORT}/?simuler=2026-11-06 11:59:50 (Ctrl+C pour arrêter)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
threading.Thread(target=srv.serve_forever, daemon=True).start()

# ---------- Heures du drop, lues dans le fichier de réglage ----------
ini = open(os.path.join(ROOT, "reglage-drop.ini"), encoding="utf-8").read()
PARIS = ZoneInfo("Europe/Paris")
OUVERTURE = datetime.strptime(re.search(r"^ouverture\s*=\s*(.+)$", ini, re.M).group(1).strip(), "%Y-%m-%d %H:%M").replace(tzinfo=PARIS)
FERMETURE = datetime.strptime(re.search(r"^fermeture\s*=\s*(.+)$", ini, re.M).group(1).strip(), "%Y-%m-%d %H:%M").replace(tzinfo=PARIS)


def pieces_du_reglage(section):
    """(listées, reliées à Shopify) dans une partie du fichier de réglage : lignes « nom = identifiant »."""
    m = re.search(r"^\[%s\]\s*$(.*?)(?=^\[|\Z)" % re.escape(section), ini, re.M | re.S)
    lignes = [l.strip() for l in m.group(1).splitlines() if "=" in l and not l.strip().startswith(("#", ";"))]
    return len(lignes), len([l for l in lignes if re.search(r"=\s*\d+\s*$", l)])


NOUVELLES, NOUVELLES_RELIEES = pieces_du_reglage("nouvelle-collection")
ANCIENNES, ANCIENNES_RELIEES = pieces_du_reglage("anciennes-pieces")
ACHETABLES = NOUVELLES_RELIEES + ANCIENNES_RELIEES  # pendant le drop : toute pièce reliée à Shopify a un bouton « + Panier »


def paris(dt, secondes=0):  # « 2026-11-06 11:59:50 », pour ?simuler=
    from datetime import timedelta
    return (dt + timedelta(seconds=secondes)).astimezone(PARIS).strftime("%Y-%m-%d %H:%M:%S")


# ---------- Chrome ----------
profil = tempfile.mkdtemp(prefix="typique-test-bascule-")
c = Chrome(profil, port=CDP_PORT)
c.call("Page.enable")
c.call("Network.enable")
c.call("Emulation.setDeviceMetricsOverride", width=1280, height=800, deviceScaleFactor=1, mobile=False)
_script_horloge = [None]


def js(expr):
    try:
        return c.js(expr)
    except Exception:  # page en cours de navigation
        return None


def reglage_serveur(**kw):
    serveur.update({k: (float(v) if k == "decalage" else v) for k, v in kw.items()})


def aller(chemin, decalage_appareil=0, bloques=(), hote="127.0.0.1"):
    """Ouvre une page. decalage_appareil : secondes d'avance (ou de retard) de l'horloge de l'appareil."""
    if _script_horloge[0]:
        c.call("Page.removeScriptToEvaluateOnNewDocument", identifier=_script_horloge[0])
        _script_horloge[0] = None
    # Avant tout script de la page : journal des changements de vue (pour voir un éventuel éclair de page d'attente)
    # et, si demandé, horloge de l'appareil truquée.
    src = ("window.__vues=[];new MutationObserver(m=>m.forEach(x=>window.__vues.push(x.target.getAttribute('data-vue'))))"
           ".observe(document,{attributes:true,subtree:true,attributeFilter:['data-vue']});")
    if decalage_appareil:
        src += ("(()=>{const D=Date,off=%d*1000;class F extends D{constructor(...a){if(a.length)super(...a);else super(D.now()+off)}"
                "static now(){return D.now()+off}}window.Date=F})();" % decalage_appareil)
    _script_horloge[0] = c.call("Page.addScriptToEvaluateOnNewDocument", source=src)["identifier"]
    c.call("Network.setBlockedURLs", urls=list(bloques))
    c.call("Page.navigate", url="http://%s:%d%s" % (hote, PORT, chemin))
    c.wait("document.readyState !== 'loading' && !!document.getElementById('attente')", 20)
    js("window.__marque = 'meme-page'")


ETAT = """JSON.stringify({
  vue: document.documentElement.dataset.vue, titre: document.title,
  coin: (document.getElementById('coin')||{}).textContent, lede: (document.getElementById('lede')||{}).textContent,
  quand: ((document.getElementById('quand')||{}).hidden ? '' : (document.getElementById('quand')||{}).textContent),
  sub: (document.getElementById('sub')||{}).textContent, attenteVisible: document.getElementById('attente').offsetParent !== null,
  source: window.HORLOGE && HORLOGE.source, marque: window.__marque, overflow: document.body.style.overflow,
  boutique: document.getElementById('root').children.length > 0,
  achat: [...document.querySelectorAll('#root button')].filter(b => /\\+ Panier|Ajouter au panier/.test(b.textContent) || b.dataset.achat === 'ouvert').length,
  bientot: [...document.querySelectorAll('#root button')].filter(b => /^Bientôt/.test(b.textContent) || b.dataset.achat === 'bientot').length,
  texteBoutique: (document.getElementById('root').innerText || '').slice(0, 4000),
  ressources: performance.getEntriesByType('resource').map(r => r.name.replace(location.origin, '').split('?')[0])
})"""


def etat():
    r = js(ETAT)
    if not r:
        return {}
    e = json.loads(r)
    for k in ("coin", "lede", "quand", "sub", "titre"):
        if isinstance(e.get(k), str):
            e[k] = e[k].replace("\u00a0", " ")  # les dates du site utilisent des espaces insécables
    return e


# Toutes les pièces sont rangées par catégorie (Drop 01, et Drop 02 depuis le bloc 10) : on ouvre chaque onglet et on compte les boutons « + Panier ».
ACHATS_CATEGORIES = """(async () => { let n = 0;
  for (const b of [...document.querySelectorAll('#root button')].filter(b => /^(t-shirts|manches longues|hoodies|accessoires)$/i.test(b.textContent.trim()))) {
    b.click(); await new Promise(r => setTimeout(r, 300));
    n += [...document.querySelectorAll('#root button')].filter(x => /\\+ Panier/.test(x.textContent)).length;
  } return n; })()"""


def attendre_vue(vue, timeout=15):
    t0 = time.time()
    ok = c.wait("document.documentElement.dataset.vue === %s" % json.dumps(vue), timeout)
    return ok, time.time() - t0


# ---------- Scénarios ----------
resultats = []


def verifier(nom, condition, detail=""):
    resultats.append((nom, bool(condition)))
    print(("  ✔ " if condition else "  ✘ ") + nom + (("  → " + str(detail)) if detail and not condition else ""), flush=True)


def charge_boutique(e):
    return any(r.endswith("/app.js") for r in e.get("ressources", []))


SCENARIOS = []


def scenario(f):
    SCENARIOS.append(f)
    return f


@scenario
def avant():
    """Avant l'ouverture : page d'attente avec la date, aucun fichier de la boutique téléchargé."""
    aller("/?simuler=" + paris(OUVERTURE, -86400 * 2))
    time.sleep(1.5)
    e = etat()
    verifier("avant : page d'attente", e["vue"] == "attente" and e["attenteVisible"], e)
    verifier("avant : coin sans tiret long", e["coin"].strip() == "Drop 02 · en préparation", e["coin"])
    verifier("avant : date d'ouverture écrite", "Ouverture le vendredi 6 novembre à 12 h" in e["quand"], e["quand"])
    verifier("avant : la boutique n'est pas téléchargée", not charge_boutique(e) and not e["boutique"], e["ressources"])
    verifier("avant : horloge simulée", e["source"] == "simulee", e["source"])


@scenario
def avant_precharge():
    """90 secondes avant l'ouverture, la boutique se charge en arrière-plan sans s'afficher."""
    aller("/?simuler=" + paris(OUVERTURE, -80))
    time.sleep(2.5)
    e = etat()
    verifier("précharge : app.js téléchargé", charge_boutique(e), e["ressources"])
    verifier("précharge : toujours la page d'attente, boutique non montée", e["vue"] == "attente" and not e["boutique"], e["vue"])


@scenario
def bascule_ouverture():
    """Un visiteur déjà sur la page voit la boutique arriver à l'heure pile, sans recharger."""
    aller("/?simuler=" + paris(OUVERTURE, -6))
    time.sleep(1.5)
    e = etat()
    verifier("ouverture : à -4 s, encore la page d'attente", e["vue"] == "attente", e["vue"])
    ok, delai = attendre_vue("boutique", 15)
    e = etat()
    verifier("ouverture : la boutique arrive", ok, e.get("vue"))
    verifier("ouverture : à l'heure pile (4 à 6 s après le chargement)", ok and 2.0 <= delai + 1.5 <= 8.0, "%.1f s" % (delai + 1.5))
    verifier("ouverture : sans recharger la page", e.get("marque") == "meme-page", e.get("marque"))
    verifier("ouverture : boutique affichée, page d'attente masquée", e.get("boutique") and not e.get("attenteVisible"))
    verifier("ouverture : pièces du Drop 02 reliées à Shopify achetables, les autres « Bientôt »",
             e.get("achat") == NOUVELLES_RELIEES and e.get("bientot") == NOUVELLES - NOUVELLES_RELIEES, (e.get("achat"), e.get("bientot")))
    n = js(ACHATS_CATEGORIES)
    verifier("ouverture : toutes les pièces reliées à Shopify achetables (Drop 01 et Drop 02)", n == ACHETABLES, (n, ACHETABLES))
    verifier("ouverture : bandeau « ouvert »", "DROP 02 OUVERT" in e.get("texteBoutique", "").upper(), "")
    verifier("ouverture : titre de l'onglet", e.get("titre") == "Typique · Entre sel et soleil", e.get("titre"))


@scenario
def ouvert_direct():
    """Arrivée pendant le drop : écran de chargement tout de suite, puis boutique."""
    aller("/?simuler=" + paris(OUVERTURE, 3600))
    ok, _ = attendre_vue("boutique", 15)
    e = etat()
    vues = js("window.__vues")
    verifier("ouvert : écran de chargement dès le départ (jamais la page d'attente)", vues and "attente" not in vues and vues[0] == "entree", vues)
    verifier("ouvert : boutique affichée", ok and e.get("boutique"), e.get("vue"))
    n = js(ACHATS_CATEGORIES)
    verifier("ouvert : toutes les pièces reliées à Shopify achetables (Drop 01 et Drop 02)", n == ACHETABLES, (n, ACHETABLES))


@scenario
def bascule_fermeture():
    """À la fermeture, la boutique laisse la place au remerciement, sans recharger."""
    aller("/?simuler=" + paris(FERMETURE, -6))
    ok, _ = attendre_vue("boutique", 15)
    verifier("fermeture : la boutique est là avant la fermeture", ok)
    js("document.body.style.overflow = 'hidden'")  # comme une fenêtre de fiche ouverte
    ok, delai = attendre_vue("attente", 15)
    time.sleep(0.5)
    e = etat()
    verifier("fermeture : retour à la page d'attente", ok and e.get("attenteVisible"), e.get("vue"))
    verifier("fermeture : texte de remerciement", e.get("lede") == "Merci, le drop est terminé." or "Merci" in (e.get("lede") or ""), e.get("lede"))
    verifier("fermeture : annonce le prochain drop", "prochain drop se prépare" in e.get("quand", ""), e.get("quand"))
    verifier("fermeture : plus aucun « Drop 02 » à l'écran", "Drop 02" not in js("document.getElementById('attente').innerText"), "")
    verifier("fermeture : boutique retirée, défilement rendu", not e.get("boutique") and e.get("overflow") == "", (e.get("boutique"), e.get("overflow")))
    verifier("fermeture : sans recharger la page", e.get("marque") == "meme-page")
    verifier("fermeture : bouton Instagram", js("!!document.querySelector('#insta a') && !document.getElementById('insta').hidden"))


@scenario
def apres():
    """Longtemps après : remerciement, boutique jamais téléchargée."""
    aller("/?simuler=" + paris(FERMETURE, 86400 * 3))
    time.sleep(1.5)
    e = etat()
    verifier("après : page d'attente de remerciement", e["vue"] == "attente" and e["coin"].strip() == "Merci", e["coin"])
    verifier("après : boutique non téléchargée", not charge_boutique(e))
    verifier("après : titre de l'onglet", e["titre"] == "Typique · Merci", e["titre"])


@scenario
def serveur_contre_appareil():
    """L'heure du serveur l'emporte sur celle de l'appareil, dans les deux sens et avec les trois sources."""
    reglage_serveur(decalage=0, api="ok")
    aller("/", decalage_appareil=86400 * 8)  # l'appareil croit être le 8 novembre
    time.sleep(3)
    e = etat()
    verifier("serveur : appareil en avance de 8 jours, le serveur dit « avant » → page d'attente",
             e["vue"] == "attente" and not e["boutique"] and e["source"] == "serveur", (e["vue"], e["source"]))

    reglage_serveur(decalage=(OUVERTURE.timestamp() + 3) - time.time(), api="ok")  # le serveur est le 6 nov. 12:00:03
    aller("/", decalage_appareil=-86400 * 3)  # l'appareil croit être le 28 octobre
    ok, _ = attendre_vue("boutique", 15)
    e = etat()
    verifier("serveur : appareil en retard, le serveur dit « ouvert » → boutique (via /api/heure)", ok and e["source"] == "serveur", (e.get("vue"), e.get("source")))

    reglage_serveur(api="absente")  # pas de fonction : l'en-tête Date du serveur prend le relais
    aller("/", decalage_appareil=-86400 * 3)
    ok, _ = attendre_vue("boutique", 15)
    e = etat()
    verifier("serveur : sans /api/heure, l'en-tête « Date » suffit", ok and e["source"] == "serveur", (e.get("vue"), e.get("source")))

    reglage_serveur(api="muette")  # serveur injoignable : heure de l'appareil, faute de mieux
    aller("/", decalage_appareil=(OUVERTURE.timestamp() + 60) - time.time())
    ok, _ = attendre_vue("boutique", 15)
    e = etat()
    verifier("serveur : serveur injoignable → heure de l'appareil", ok and e["source"] == "appareil", (e.get("vue"), e.get("source")))
    reglage_serveur(decalage=0, api="ok")


@scenario
def simulation_local_seulement():
    """?simuler= est ignoré hors de l'ordinateur local : en ligne, il permettrait d'acheter avant l'heure."""
    import socket
    # La vraie adresse du Mac sur son réseau (gethostbyname peut répondre 127.0.0.1, qui est locale : le test n'aurait plus de sens).
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sonde:
        sonde.connect(("192.0.2.1", 9))  # aucun paquet n'est envoyé
        ip = sonde.getsockname()[0]
    reglage_serveur(decalage=0, api="ok")
    aller("/?simuler=" + paris(OUVERTURE, 3600), hote=ip)
    time.sleep(2.5)
    e = etat()
    verifier("simulation : ignorée sur une adresse qui n'est pas locale (%s)" % ip, e["source"] != "simulee" and e["vue"] == "attente" and not e["boutique"], (e["source"], e["vue"]))


@scenario
def echec_chargement():
    """Si les fichiers de la boutique ne se chargent pas : message honnête, pas d'écran de chargement sans fin."""
    aller("/?simuler=" + paris(OUVERTURE, 3600), bloques=["*app.js*"])
    ok, _ = attendre_vue("attente", 40)
    e = etat()
    verifier("échec : retour à la page d'attente avec un message", ok and "ne s'est pas chargée" in (e.get("lede") or ""), (e.get("vue"), e.get("lede")))
    verifier("échec : conseil de recharger", "recharge" in (e.get("sub") or ""), e.get("sub"))


@scenario
def apercu():
    """/apercu/ garde son comportement : boutique tout de suite, boutons selon l'heure."""
    aller("/apercu/")
    c.wait("document.getElementById('root') && document.getElementById('root').children.length > 0", 15)
    r = json.loads(js("JSON.stringify({boutique: document.getElementById('root').children.length > 0, source: HORLOGE.source})"))
    verifier("apercu : boutique affichée, aucun achat avant l'ouverture", r["boutique"] and js(ACHATS_CATEGORIES) == 0, r)
    aller("/apercu/?simuler=" + paris(OUVERTURE, 3600))
    c.wait("document.getElementById('root').children.length > 0", 15)
    time.sleep(1)
    n = js(ACHATS_CATEGORIES)
    verifier("apercu : pendant le drop, toutes les pièces reliées à Shopify achetables", n == ACHETABLES, (n, ACHETABLES))


def reconstruire(mode=None):
    cmd = [sys.executable, os.path.join(ROOT, "tools", "build.py")] + ([mode] if mode else [])
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 0, r.stdout + r.stderr


def modes_de_secours():
    print("Mode « attente » (secours)", flush=True)
    reconstruire("attente")
    aller("/?simuler=" + paris(OUVERTURE, 3600))
    time.sleep(2)
    e = etat()
    verifier("secours attente : drop ouvert → « boutique fermée pour le moment », pas de boutique",
             e["vue"] == "attente" and "fermée pour le moment" in e["titre"] and "en pause" in e["coin"] and not charge_boutique(e), (e["vue"], e["titre"], e["coin"]))
    aller("/?simuler=" + paris(OUVERTURE, -80))
    time.sleep(2)
    e = etat()
    verifier("secours attente : même 80 s avant l'ouverture, la boutique n'est pas téléchargée", not charge_boutique(e) and e["vue"] == "attente")
    aller("/?simuler=" + paris(OUVERTURE, -86400))
    time.sleep(1.5)
    e = etat()
    verifier("secours attente : avant l'ouverture, la date est annoncée", "Ouverture" in e["quand"], e["quand"])
    print("Mode « boutique » (secours)", flush=True)
    reconstruire("boutique")
    aller("/?simuler=" + paris(OUVERTURE, -86400 * 2))
    ok, _ = attendre_vue("boutique", 15)
    e = etat()
    verifier("secours boutique : boutique montrée avant l'ouverture, sans bouton d'achat actif", ok and e.get("boutique") and js(ACHATS_CATEGORIES) == 0, (e.get("vue"), e.get("achat")))
    reconstruire()


filtre = sys.argv[1] if len(sys.argv) > 1 else None
try:
    reconstruire("automatique")  # les scénarios testent la bascule automatique
    for f in SCENARIOS:
        if filtre and filtre not in f.__name__:
            continue
        print(f.__name__ + " : " + (f.__doc__ or "").strip(), flush=True)
        f()
    if not filtre or "secours" in filtre or "mode" in filtre:
        modes_de_secours()
finally:
    c.close()
    reconstruire()

echecs = [n for n, ok in resultats if not ok]
print("\n%d vérifications, %d échec(s)" % (len(resultats), len(echecs)))
for n in echecs:
    print("  ✘ " + n)
sys.exit(1 if echecs else 0)
