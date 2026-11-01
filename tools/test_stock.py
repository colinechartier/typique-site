"""Test des prix et du stock lus dans Shopify, en local, drop forcé ouvert. Rien n'est acheté, rien n'est modifié chez Shopify :
les cas « taille épuisée », « pièce épuisée », « Shopify en panne » sont simulés en retouchant la réponse de Shopify dans le navigateur
de test (jamais dans le site, jamais dans le vrai stock).

  python3 tools/test_stock.py            # tous les scénarios, environ 1 minute
"""
import http.server, json, os, re, sys, tempfile, threading, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome
import build

PORT, CDP_PORT = 8092, 9335
app = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
app_reel, n1 = re.subn(r'"ouverture":"[^"]+"', '"ouverture":"2000-01-01T00:00:00+01:00"', app)
app_reel, n2 = re.subn(r'"fermeture":"[^"]+"', '"fermeture":"2099-12-31T23:59:00+01:00"', app_reel)
assert n1 == 1 and n2 == 1, "dates du drop introuvables dans app.js"
# Drop ouvert avec le réglage du jour tel quel : le site comme il sera en ligne (scénario 4, variante « reel »).
# Les autres scénarios partent d'une nouvelle collection pas encore reliée à Shopify : on retire ses identifiants de la copie servie.
app_ouvert = app_reel
for ident, _, _ in build.lire_reglage(build.REGLAGE)["nouvelles"]:
    app_ouvert = re.sub(r'"%s":"\d+",?' % re.escape(ident), "", app_ouvert)
    assert '"%s":"' % ident not in app_ouvert, "identifiant de la nouvelle collection encore présent dans la copie servie"
# Drop ouvert, et deux pièces de la nouvelle collection reliées à Shopify pour l'essai : L'Estaque = Le Ferret (existe),
# La Pinède = identifiant que Shopify ne connaît pas.
FERRET = "15770490175872"
app_essai = app_ouvert.replace('"shopifyIds":{', '"shopifyIds":{"ts-estaque":"%s","ts-pinede":"1",' % FERRET, 1)
assert app_essai != app_ouvert
# Une ancienne pièce (La Garrigue) dont l'identifiant est inconnu de Shopify disparaît : variante pour le scénario « inconnue ».
app_inconnue = re.sub(r'("acc-garrigue":")\d+', r'\g<1>2', app_ouvert, count=1)
assert app_inconnue != app_ouvert
VARIANTES = {"/app.js": app_ouvert, "/app-essai.js": app_essai, "/app-inconnue.js": app_inconnue, "/app-reel.js": app_reel}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        chemin = self.path.split("?")[0]
        if chemin == "/apercu/index.html" or chemin == "/apercu/":
            html = open(os.path.join(ROOT, "apercu", "index.html"), encoding="utf-8").read()
            q = self.path.partition("?")[2]
            if "variante=" in q:
                html = html.replace('src="/app.js', 'src="/app-%s.js' % q.partition("variante=")[2].split("&")[0])
            data = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if chemin in VARIANTES:
            data = VARIANTES[chemin].encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


# Le navigateur de test retouche la réponse de Shopify à la lecture du stock (et seulement elle) selon window.__stock :
#   { delai: ms, panne: 'reseau' | '500' | 'erreurs', modif: (json) => ... }
ESPION = r"""
if (location.hostname === '127.0.0.1') {
  window.__stock = {}; window.__alertes = []; window.__lectures = 0;
  window.alert = m => window.__alertes.push(String(m));
  const _f = window.fetch;
  window.fetch = async function (url, opts) {
    const lecture = opts && typeof opts.body === 'string' && opts.body.includes('nodes(ids');
    if (!lecture) return _f.apply(this, arguments);
    const s = window.__stock; window.__lectures++;
    if (s.delai) await new Promise(r => setTimeout(r, s.delai));
    if (s.panne === 'reseau') throw new TypeError('Failed to fetch');
    if (s.panne === '500') return new Response('{}', { status: 500 });
    if (s.panne === 'erreurs') return new Response(JSON.stringify({ errors: [{ message: 'x' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const rep = await _f.apply(this, arguments);
    if (!s.modif) return rep;
    const json = await rep.json(); s.modif(json);
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
"""

CARTES = r"""(() => [...document.querySelectorAll('article.product-card')].map(a => {
  const bs = [...a.querySelectorAll('button')];
  const action = bs.find(b => ['+ Panier', 'Bientôt', '…', 'Indisponible'].includes(b.textContent.trim()));
  const prixEl = a.querySelector('span.font-serif.text-xl');
  return { nom: a.querySelector('h3').textContent.trim(), prix: prixEl ? prixEl.textContent.trim() : null,
    tailles: bs.filter(b => b.closest('.flex-wrap')).map(b => ({ t: b.textContent.trim(), off: b.disabled, sel: b.style.backgroundColor === 'rgb(15, 40, 101)', barre: b.style.textDecoration })),
    squelette: !!a.querySelector('[aria-hidden="true"]') && !a.querySelector('.flex-wrap button'), bouton: action ? action.textContent.trim() : null };
}))()"""

ok_total, ko = 0, []


def verifie(cond, texte):
    global ok_total
    if cond:
        ok_total += 1
        print("  ok  ", texte)
    else:
        ko.append(texte)
        print("  ÉCHEC", texte)


def api_shopify():
    """Prix et disponibilité tels que Shopify les donne (lecture directe, pour comparer avec le site)."""
    src = open(os.path.join(ROOT, "design_handoff_typique_site", "typique-site.jsx"), encoding="utf-8").read()
    tok = re.search(r"SHOPIFY_TOKEN\s*=\s*'([^']+)'", src).group(1)
    dom = re.search(r"SHOPIFY_DOMAIN\s*=\s*'([^']+)'", src).group(1)
    reg = build.lire_reglage(build.REGLAGE)
    ids = {ident: sid for ident, _, sid in reg["nouvelles"] + reg["anciennes"] if sid}
    q = "query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title variants(first: 50) { nodes { title availableForSale price { amount } } } } } }"
    req = urllib.request.Request(f"https://{dom}/api/2026-07/graphql.json", headers={"Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": tok},
                                 data=json.dumps({"query": q, "variables": {"ids": [f"gid://shopify/Product/{n}" for n in ids.values()]}}).encode())
    with urllib.request.urlopen(req, timeout=30) as r:
            noeuds = json.load(r)["data"]["nodes"]
    noms = dict(build.catalogue_jsx())
    return {noms[ident]: n["variants"]["nodes"] for ident, n in zip(ids, noeuds) if n}


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
profil = tempfile.mkdtemp(prefix="typique-test-stock-")
c = Chrome(profil, port=CDP_PORT)


def js(expr):
    try:
        return c.js(expr)
    except Exception as e:
        return f"__erreur__ {e}"


def attendre(expr, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = js(expr)
        if v and not (isinstance(v, str) and v.startswith("__erreur__")):
            return v
        time.sleep(0.2)
    return None


def regler(scenario_js):
    js(f"window.__stock = {scenario_js}")


def recharger(scenario_js="{}", variante=None):
    """Prépare le scénario puis recharge la page (le scénario est posé avant le site, par le script d'espion)."""
    js(f"sessionStorage.setItem('scenario', {json.dumps(scenario_js)})")
    c.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/apercu/" + (f"?variante={variante}" if variante else ""))
    time.sleep(0.4)


def onglet(nom):
    assert attendre(f"[...document.querySelectorAll('button')].some(b => b.textContent.trim().toUpperCase() === '{nom}')", 20), f"onglet {nom} introuvable"
    js(f"[...document.querySelectorAll('button')].find(b => b.textContent.trim().toUpperCase() === '{nom}').click()")
    time.sleep(0.6)


def onglets():
    return js("[...document.querySelectorAll('#pieces button')].map(b => b.textContent.trim()).filter(t => t === t.toUpperCase() && t.length > 3 && !t.includes('→') && t !== 'RÉESSAYER')") or []


def cartes():
    return js(CARTES) or []


def carte(nom):
    return next((x for x in cartes() if x["nom"] == nom), None)


def clic_taille(nom, taille):
    js(f"""(() => {{ const a = [...document.querySelectorAll('article.product-card')].find(a => a.querySelector('h3').textContent.trim() === {json.dumps(nom)});
      const b = [...a.querySelectorAll('.flex-wrap button')].find(b => b.textContent.trim() === {json.dumps(taille)}); b.click(); }})()""")
    time.sleep(0.3)


def clic_bouton(nom, texte):
    js(f"""(() => {{ const a = [...document.querySelectorAll('article.product-card')].find(a => a.querySelector('h3').textContent.trim() === {json.dumps(nom)});
      [...a.querySelectorAll('button')].find(b => b.textContent.trim() === {json.dumps(texte)}).click(); }})()""")
    time.sleep(0.5)


def texte_boutique():
    return js("(document.getElementById('pieces') || document.body).innerText.replace(/\\s+/g, ' ')") or ""


def modif_js(corps):
    """Fonction JS (json) => ... qui retouche la réponse de Shopify : corps est du JS qui manipule `json`."""
    return "{ modif: (json) => { " + corps + " } }"


_reg = build.lire_reglage(build.REGLAGE)
_noms = dict(build.catalogue_jsx())
ID_DE = {_noms[ident]: sid for ident, _, sid in _reg["nouvelles"] + _reg["anciennes"] if sid}  # nom de la pièce → identifiant Shopify


def par_titre(nom, action):
    """Applique `action` (JS, sur n) au produit de cette pièce dans la réponse de Shopify."""
    return f"for (const n of json.data.nodes) if (n && n.id.endsWith('/{ID_DE[nom]}')) {{ {action} }}"


def epuiser(*noms):
    return modif_js("".join(par_titre(nom, "n.variants.nodes.forEach(v => v.availableForSale = false);") for nom in noms))


try:
    for dom in ("Page", "Runtime", "Network"):
        c.call(f"{dom}.enable")
    ua = c.js("navigator.userAgent").replace("HeadlessChrome", "Chrome")
    c.call("Network.setUserAgentOverride", userAgent=ua, acceptLanguage="fr-FR,fr")
    c.call("Emulation.setDeviceMetricsOverride", width=1280, height=1700, deviceScaleFactor=1, mobile=False)
    # Le scénario est lu dans sessionStorage avant le chargement du site.
    c.call("Page.addScriptToEvaluateOnNewDocument", source=ESPION + "\nif (location.hostname === '127.0.0.1') { try { const sc = sessionStorage.getItem('scenario'); if (sc) window.__stock = eval('(' + sc + ')'); } catch (e) {} }")

    # ---------------------------------------------------------------- 1. Réel
    print("\n1. Prix et tailles comme dans Shopify (réponse réelle, rien de retouché)")
    shop = api_shopify()
    recharger("{}")
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    nouvelle = cartes()
    verifie(len(nouvelle) == 7 and all(x["bouton"] == "Bientôt" and not x["prix"] and not x["tailles"] for x in nouvelle),
            "Nouvelle collection : 7 pièces en « Bientôt », sans prix ni tailles (pas d'identifiant Shopify)")
    for nom_onglet, tout, pieces in (
            ("T-SHIRTS", ["L'Estaque", "La Pinède", "Le Ferret", "L'Entre Deux", "Sable chaud"], ["Le Ferret", "L'Entre Deux", "Sable chaud"]),
            ("HOODIES", ["Plein cagnard", "Le Minot du Sud", "Corps Salé Coeur Solaire", "Le Mistral", "La Tchanquée", "Le Surfer"], ["Le Mistral", "La Tchanquée", "Le Surfer"]),
            ("ACCESSOIRES", ["Le Pilat", "La Garrigue"], ["Le Pilat", "La Garrigue"])):
        onglet(nom_onglet)
        attendre("document.querySelectorAll('article.product-card').length > 0", 10)
        noms = [x["nom"] for x in cartes()]
        verifie(noms == tout, f"{nom_onglet} : {noms}")
        for nom in pieces:
            x, v = carte(nom), shop[nom]
            prix_attendu = f"{float(v[0]['price']['amount']):g} €"
            tailles_attendues = ["Taille unique"] if v[0]["title"] == "Default Title" else [{"2XL": "XXL"}.get(t["title"], t["title"]) for t in v]
            tailles_site = [t["t"] for t in x["tailles"]] or (["Taille unique"] if "Taille unique" in texte_boutique() and len(v) == 1 else [])
            verifie(x["prix"] == prix_attendu and x["bouton"] == "+ Panier" and (tailles_site == tailles_attendues or (len(v) == 1 and x["tailles"] == [])),
                    f"{nom} : site {x['prix']}, tailles {tailles_site or 'Taille unique'}, bouton {x['bouton']} ; Shopify {prix_attendu}, {tailles_attendues}")
    verifie(js("window.__lectures") == 1, f"une seule lecture de Shopify pour toute la boutique (lectures : {js('window.__lectures')})")

    # ---------------------------------------------------------------- 2. Taille épuisée
    print("\n2. Une taille épuisée (Le Ferret XS) : grisée, impossible à choisir, jamais proposée par défaut")
    recharger(modif_js(par_titre("Le Ferret", "n.variants.nodes.find(v => v.title === 'XS').availableForSale = false;")))
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    onglet("T-SHIRTS")
    x = carte("Le Ferret")
    xs = next(t for t in x["tailles"] if t["t"] == "XS")
    verifie(xs["off"] and "line-through" in xs["barre"], "XS désactivée et barrée")
    verifie(all(not t["off"] for t in x["tailles"] if t["t"] != "XS"), "les 5 autres tailles restent disponibles")
    verifie([t["t"] for t in x["tailles"] if t["sel"]] == ["S"], f"taille choisie par défaut : S (pas XS) → {[t['t'] for t in x['tailles'] if t['sel']]}")
    js("""(() => { const a = [...document.querySelectorAll('article.product-card')].find(a => a.querySelector('h3').textContent.trim() === 'Le Ferret');
      [...a.querySelectorAll('.flex-wrap button')].find(b => b.textContent.trim() === 'XS').click(); })()""")
    time.sleep(0.3)
    verifie([t["t"] for t in carte("Le Ferret")["tailles"] if t["sel"]] == ["S"], "un clic sur XS ne la choisit pas")
    clic_bouton("Le Ferret", "+ Panier")
    verifie("Taille S" in (js("document.body.innerText") or "") and "Taille XS" not in (js("document.body.innerText") or ""), "le panier reçoit la taille S")
    js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Fermer')).click()")

    # ---------------------------------------------------------------- 3. Pièce / catégorie épuisée
    print("\n3. Une pièce sans aucun stock est retirée ; une catégorie vide disparaît")
    recharger(epuiser("Le Mistral"))
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    onglet("HOODIES")
    verifie("Le Mistral" not in [x["nom"] for x in cartes()] and "La Tchanquée" in [x["nom"] for x in cartes()] and "Le Surfer" in [x["nom"] for x in cartes()],
            f"HOODIES sans Le Mistral, les autres restent : {[x['nom'] for x in cartes()]}")
    recharger(epuiser("Le Pilat", "La Garrigue"))
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    t = onglets()
    verifie("ACCESSOIRES" not in t and "T-SHIRTS" in t and "HOODIES" in t, f"onglet ACCESSOIRES disparu quand ses 2 pièces sont épuisées : {t}")
    recharger("{}", variante="inconnue")
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    attendre("document.querySelector('#pieces') && !document.body.innerText.toLowerCase().includes('prix et tailles non chargés')", 10)
    onglet("ACCESSOIRES")
    verifie([x["nom"] for x in cartes()] == ["Le Pilat"], f"ancienne pièce inconnue de Shopify retirée : {[x['nom'] for x in cartes()]}")

    # ---------------------------------------------------------------- 4. Nouvelle collection reliée à Shopify
    print("\n4. Nouvelle collection : pièce reliée à Shopify, pièce inconnue de Shopify")
    recharger("{}", variante="essai")
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    attendre("[...document.querySelectorAll('article.product-card')].some(a => a.textContent.includes('+ Panier'))", 15)
    x, y = carte("L'Estaque"), carte("La Pinède")
    verifie(x and x["prix"] == "44 €" and x["bouton"] == "+ Panier" and len(x["tailles"]) == 6, f"L'Estaque (identifiant du Ferret) : {x['prix']}, {len(x['tailles'])} tailles, {x['bouton']}")
    verifie(y and y["bouton"] == "Bientôt" and not y["prix"] and not y["tailles"], "La Pinède (identifiant inconnu de Shopify) : « Bientôt », sans prix")
    # Le site comme il sera : la nouvelle collection reliée à Shopify telle que réglée dans reglage-drop.ini (réponse réelle).
    reliees = [build.sans_accent(nom) for _, nom, sid in build.lire_reglage(build.REGLAGE)["nouvelles"] if sid]
    if reliees:
        recharger("{}", variante="reel")
        attendre("document.querySelectorAll('article.product-card').length > 0", 30)
        attendre("[...document.querySelectorAll('article.product-card')].some(a => a.textContent.includes('+ Panier'))", 15)
        reel = {build.sans_accent(z["nom"]): z for z in cartes()}
        verifie(all(reel.get(n) and reel[n]["bouton"] == "+ Panier" and reel[n]["prix"] and reel[n]["tailles"] for n in reliees),
                f"réglage du jour : les {len(reliees)} pièces reliées à Shopify ont un prix, des tailles et « + Panier »")
    else:
        print("  (aucune pièce de la nouvelle collection n'est reliée dans reglage-drop.ini : rien à vérifier ici)")

    # ---------------------------------------------------------------- 5. Prix retouchés
    print("\n5. Le prix suit Shopify, taille par taille (44 → 45,5 en XS et 46 en M)")
    recharger(modif_js(par_titre("Le Ferret", "for (const v of n.variants.nodes) { if (v.title === 'XS') v.price.amount = '45.5'; if (v.title === 'M') v.price.amount = '46.0'; }")))
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    onglet("T-SHIRTS")
    clic_taille("Le Ferret", "XS")
    verifie(carte("Le Ferret")["prix"] == "45,50 €", f"XS : {carte('Le Ferret')['prix']}")
    clic_taille("Le Ferret", "M")
    verifie(carte("Le Ferret")["prix"] == "46 €", f"M : {carte('Le Ferret')['prix']}")
    clic_bouton("Le Ferret", "+ Panier")
    clic_taille("Le Ferret", "XS")
    clic_bouton("Le Ferret", "+ Panier")
    panier = js("document.body.innerText.replace(/\\s+/g, ' ')")
    verifie("91,50 €" in panier, "total du panier XS + M = 91,50 €")

    # ---------------------------------------------------------------- 6. Taille partie pendant que le client choisit
    print("\n6. Le Ferret en M au panier, puis M épuisée avant le clic sur Commander : pas de paiement, message")
    recharger("{}")
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    onglet("T-SHIRTS")
    clic_taille("Le Ferret", "M")
    clic_bouton("Le Ferret", "+ Panier")
    regler(modif_js(par_titre("Le Ferret", "n.variants.nodes.find(v => v.title === 'M').availableForSale = false;")))
    js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Commander')).click()")
    time.sleep(1.5)
    panier = js("document.body.innerText.replace(/\\s+/g, ' ')")
    verifie(js("location.hostname") == "127.0.0.1", "le client reste sur le site (pas de redirection vers le paiement)")
    verifie("plus disponible" in panier and "Retire-la pour continuer" in panier, "message dans le panier : pièce plus disponible")
    verifie(js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Commander')).disabled") is True, "bouton Commander bloqué")
    js("[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '✕').pop().click()")
    time.sleep(0.4)
    verifie("Ton panier est vide" in (js("document.body.innerText") or ""), "après retrait de la ligne, le panier est vide")

    # ---------------------------------------------------------------- 7. Shopify en panne
    print("\n7. Shopify ne répond pas : message honnête, aucun prix, aucun bouton d'achat")
    for panne in ("reseau", "500", "erreurs"):
        recharger("{ panne: '%s' }" % panne)
        verifie(attendre("document.body.innerText.toLowerCase().includes('prix et tailles non chargés')", 20) is True, f"panne « {panne} » : message affiché après les deux essais")
        onglet("T-SHIRTS")
        cs = cartes()
        anciennes = [x for x in cs if x["nom"] in ("Le Ferret", "L'Entre Deux", "Sable chaud")]
        verifie(len(anciennes) == 3 and all(x["bouton"] == "Indisponible" and not x["prix"] and not x["tailles"] for x in anciennes), f"panne « {panne} » : les 3 pièces en vente en « Indisponible », sans prix ni taille")
        verifie(all(x["bouton"] == "Bientôt" for x in cs if x not in anciennes), f"panne « {panne} » : les pièces sans identifiant restent en « Bientôt »")
        verifie(not re.search(r"\d+(,\d+)? €", texte_boutique()), f"panne « {panne} » : aucun prix à l'écran")
        verifie(js("window.__lectures") == 2, f"panne « {panne} » : 2 essais (lectures : {js('window.__lectures')})")
    regler("{}")
    js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Réessayer').click()")
    verifie(attendre("[...document.querySelectorAll('article.product-card')].some(a => a.textContent.includes('+ Panier'))", 15) is True, "« Réessayer » après la panne : les prix et les boutons reviennent")
    verifie("prix et tailles non chargés" not in (js("document.body.innerText") or "").lower(), "le message disparaît")

    # ---------------------------------------------------------------- 8. Shopify lent
    print("\n8. Shopify lent (3 s) : la boutique s'affiche tout de suite, les prix arrivent ensuite")
    recharger("{ delai: 3000 }")
    t0 = time.time()
    attendre("document.querySelectorAll('article.product-card').length > 0", 30)
    t_cartes = time.time() - t0
    onglet("T-SHIRTS")
    cs = [x for x in cartes() if x["nom"] in ("Le Ferret", "L'Entre Deux", "Sable chaud")]
    verifie(len(cs) == 3 and all(x["prix"] in ("", None) and x["bouton"] == "…" and x["squelette"] for x in cs), f"pendant l'attente : cartes visibles, bouton « … », emplacements vides, aucun prix ({t_cartes:.1f} s pour afficher les cartes)")
    verifie(attendre("[...document.querySelectorAll('article.product-card')].some(a => a.textContent.includes('+ Panier'))", 15) is True, "puis les prix et les tailles arrivent")
    # Les alertes JS du site ne doivent pas avoir servi
    verifie(not js("window.__alertes"), f"aucune alerte JS dans tout le test (alertes : {js('window.__alertes')})")
    erreurs = [e["params"]["exceptionDetails"].get("exception", {}).get("description", "") for e in c.events if e.get("method") == "Runtime.exceptionThrown"]
    verifie(not erreurs, f"aucune erreur JS (erreurs : {erreurs[:3]})")
finally:
    c.close()
    srv.shutdown()

print(f"\n{ok_total} vérifications réussies, {len(ko)} échec(s).")
for k in ko:
    print("  ÉCHEC :", k)
sys.exit(1 if ko else 0)
