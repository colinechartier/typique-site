"""Le portant de la nouvelle collection, sur le site reconstruit, avec Chrome sans écran et l'heure d'ouverture simulée.
Rien n'est payé ; avec --paiement, le parcours va jusqu'à la page de paiement Shopify et s'y arrête.
Usage : python3 tools/test_portant.py [--paiement] [dossier_captures]
"""
import http.server, json, os, shutil, socketserver, sys, tempfile, threading, time, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PAIEMENT = "--paiement" in sys.argv
CAP = ARGS[0] if ARGS else tempfile.mkdtemp()
os.makedirs(CAP, exist_ok=True)
PUBLIC = tempfile.mkdtemp()
for f in ("index.html", "app.js", "boutique.css", "favicon.ico", "icon-192.png", "apple-touch-icon.png", "apercu", "legal", "photos", "media", "vendor"):
    if os.path.exists(os.path.join(ROOT, f)):
        os.symlink(os.path.join(ROOT, f), os.path.join(PUBLIC, f))


class Silence(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=PUBLIC, **k)
    def log_message(self, *a): pass


class Serveur(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


srv = Serveur(("127.0.0.1", 8096), Silence)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8096/apercu/?simuler="
OUVERT = BASE + urllib.parse.quote("2026-11-06 12:05:00")
AVANT = BASE + urllib.parse.quote("2026-11-06 11:00:00")
SEPT = ["L'Estaque", "La Pinède", "Soleil couchant", "Petit matin", "Plein cagnard", "Le Minot du Sud", "Corps Salé Coeur Solaire"]
PRIX = {"L'Estaque": 40, "La Pinède": 42, "Soleil couchant": 40, "Petit matin": 38, "Plein cagnard": 60, "Le Minot du Sud": 70, "Corps Salé Coeur Solaire": 70}

ok = ko = 0
def verifie(cond, texte, detail=""):
    global ok, ko
    if cond: ok += 1; print("  ✔", texte)
    else: ko += 1; print("  ✘", texte, " → ", detail)

c = Chrome(tempfile.mkdtemp(), port=9431)
c.call("Runtime.enable"); c.call("Page.enable")
J = c.js
def ecran(w, h, tel=False):
    c.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=2 if tel else 1, mobile=tel)
    c.call("Emulation.setTouchEmulationEnabled", enabled=tel, maxTouchPoints=5 if tel else 1)
    c.call("Emulation.setEmulatedMedia", features=[{"name": "hover", "value": "none"}, {"name": "pointer", "value": "coarse"}] if tel else [])
def charge(url):
    c.call("Page.navigate", url=url)
    assert c.wait("document.querySelectorAll('.portant-piece').length === 7", 30), "portant absent"
    c.wait("document.querySelectorAll('.portant-piece[data-achat=\"chargement\"]').length === 0", 20)
    J("window.scrollTo({top:document.querySelector('.portant').getBoundingClientRect().top+scrollY-90,behavior:'instant'})")
    time.sleep(1.4)
def clic(x, y):
    for t in ("mousePressed", "mouseReleased"):
        c.call("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left", clickCount=1)
def centre(sel):
    return J(f"(()=>{{const r=document.querySelector({json.dumps(sel)}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")
def clique(sel):
    x, y = centre(sel); clic(x, y)
def bouton_texte(t):
    x, y = J(f"(()=>{{const b=[...document.querySelectorAll('.portant-fiche button')].find(b=>b.textContent.trim()==={json.dumps(t)});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")
    clic(x, y)
VOL = "(()=>{const r=document.querySelector('.portant-vol').getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(v=>Math.round(v*10)/10).join('/')})()"
NOM = "document.querySelector('.portant-nom')?.textContent"
ACHAT = "document.querySelector('.portant-achat')"
def ouvre(i):
    x, y = J(f"(()=>{{const r=document.querySelectorAll('.portant-rail .portant-piece')[{i}].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")
    clic(x, y)
    assert c.wait("!!document.querySelector('.portant-fiche.pret')", 5), "fiche non ouverte"
    time.sleep(.75)
def echap():
    c.call("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    c.call("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)

try:
    print("1. Sur ordinateur (1440 x 900), drop ouvert")
    ecran(1440, 900); charge(OUVERT)
    cadres = J("[...new Set([...document.querySelectorAll('.portant-rail .portant-cadre')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.width),Math.round(r.height)].join('/')}))]")
    verifie(len(cadres) == 1, "les 7 cadres ont la même hauteur et la même taille", cadres)
    ecarts = J("[...new Set([...document.querySelectorAll('.portant-rail .portant-piece')].map((e,i,a)=>i?Math.round(e.getBoundingClientRect().left-a[i-1].getBoundingClientRect().left):null).filter(v=>v!==null))]")
    verifie(len(ecarts) == 1, "écart identique entre les pièces", ecarts)
    verifie(J("[...document.querySelectorAll('.portant-rail .portant-piece')].every(e=>e.dataset.achat==='ouvert')"), "les 7 pièces sont achetables")
    verifie(J("[...document.querySelectorAll('.portant-rail img')].every(i=>/portant_.*_dos/.test(i.src))"), "le portant montre les dos")
    verifie(J("document.documentElement.scrollWidth<=document.documentElement.clientWidth"), "pas de débordement de la page")
    c.shot(CAP + "/d0_portant.png")
    AIR = "(()=>{const q=s=>document.querySelector(s).getBoundingClientRect();const o=[...document.querySelectorAll('#pieces button')].find(b=>/nouvelle collection/i.test(b.textContent));return [Math.round(q('.portant-barre').top-o.getBoundingClientRect().bottom),Math.round(q('#pieces').bottom-q('.portant-legende').bottom)]})()"
    for (lw, lh) in ((1280, 720), (1440, 790), (1920, 1080), (1440, 900)):
        ecran(lw, lh); time.sleep(.5)
        J("window.scrollTo({top:document.querySelector('.portant').getBoundingClientRect().top+scrollY-90,behavior:'instant'})"); time.sleep(.5)
        haut, bas = J(AIR)
        verifie(abs(haut - bas) <= 4, f"{lw} x {lh} : portant centré, même vide au-dessus et en dessous ({haut} et {bas} px)", (haut, bas))
        for i in (0, 6):
            px, py = J(f"(()=>{{const r=document.querySelectorAll('.portant-rail .portant-piece')[{i}].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")
            c.call("Input.dispatchMouseEvent", type="mouseMoved", x=px, y=py); time.sleep(.8)
            reste = J("(()=>{const q=s=>document.querySelector(s).getBoundingClientRect();return Math.round(q('#pieces').bottom-Math.max(q('.portant-piece.actif .portant-cadre').bottom,q('.portant-legende').bottom))})()")
            verifie(reste >= 0, f"   survol pièce {i + 1} : pièce et légende restent dans la section (marge {reste} px)", reste)
            verifie(J("document.querySelector('.portant-legende').getBoundingClientRect().left>=0&&document.querySelector('.portant-legende').getBoundingClientRect().right<=innerWidth"), "   la légende reste dans l'écran")
        c.call("Input.dispatchMouseEvent", type="mouseMoved", x=2, y=2); time.sleep(.4)
    J("window.scrollTo({top:document.querySelector('.portant').getBoundingClientRect().top+scrollY-90,behavior:'instant'})"); time.sleep(.5)
    x, y = J("(()=>{const r=document.querySelectorAll('.portant-rail .portant-piece')[4].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
    c.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y); time.sleep(.9)
    verifie(J("document.querySelector('.portant-piece.actif')?.dataset.piece") == "sw-pleincagnard", "survol : Plein cagnard grandit")
    verifie("Plein cagnard · 60" in (J("document.querySelector('.portant-legende').textContent") or ""), "survol : nom et prix sous la pièce", J("document.querySelector('.portant-legende').textContent"))
    c.shot(CAP + "/d1_survol.png")
    clic(x, y); assert c.wait("!!document.querySelector('.portant-fiche.pret')", 5); time.sleep(.75)
    c.shot(CAP + "/d2_fiche.png")
    verifie(J(NOM) == "Plein cagnard", "clic : la fiche de Plein cagnard s'ouvre")
    verifie(J("document.body.style.overflow") == "hidden", "la page derrière ne défile plus")
    crochet = J("(()=>{const r=document.querySelector('.portant-vol').getBoundingClientRect();return r.top+r.height*.0168})()")
    verifie(abs(crochet - 81) < .5, "le crochet est sur la barre", crochet)
    verifie(J("!document.querySelector('.portant-vol').classList.contains('montre-face')") and J("document.querySelector('[data-vue=dos]').classList.contains('on')"), "la fiche s'ouvre côté dos")
    verifie(J(ACHAT + ".disabled") and J(ACHAT + ".textContent.trim()") == "Choisir une taille", "aucune taille d'avance, bouton inactif")
    verifie(J("document.querySelector('.portant-achat').getBoundingClientRect().bottom<=innerHeight"), "le bouton d'achat est visible sans défiler")
    r0 = J(VOL)
    clique("[data-vue=face]"); time.sleep(.7)
    verifie(J("document.querySelector('.portant-vol').classList.contains('montre-face')") and J(VOL) == r0, "Face : la pièce se retourne sans bouger")
    c.shot(CAP + "/d3_face.png")
    clique("[data-vue=dos]"); time.sleep(.7)
    print("   les 7 fiches, à la flèche")
    vus, rects = [J(NOM)], {J(VOL)}
    for _ in range(6):
        clique(".portant-fleche[aria-label='Pièce suivante']"); time.sleep(.75)
        vus.append(J(NOM)); rects.add(J(VOL))
        verifie((J("document.querySelector('.portant-prix').textContent") or "").endswith(f"{PRIX[vus[-1]]},00 €") or f"{PRIX[vus[-1]]}" in J("document.querySelector('.portant-prix').textContent"), f"{vus[-1]} : {PRIX[vus[-1]]} €", J("document.querySelector('.portant-prix').textContent"))
    verifie(sorted(vus) == sorted(SEPT), "toutes les pièces passent", vus)
    verifie(len(rects) == 1, "la pièce reste exactement au même endroit d'une fiche à l'autre", rects)
    clique(".portant-fleche[aria-label='Pièce suivante']"); time.sleep(.75)
    verifie(J(NOM) == "Plein cagnard", "le tour se referme sur la première pièce", J(NOM))
    print("   détails, livraison, fermeture")
    bouton_texte("Composition et entretien"); time.sleep(.55)
    verifie(J("document.querySelector('.portant-details.on')?.innerText.includes('coton')"), "Composition et entretien : la matière s'affiche")
    c.shot(CAP + "/d4_details.png")
    echap(); time.sleep(.5)
    verifie(J("!document.querySelector('.portant-details.on')") and J("!!document.querySelector('.portant-fiche.pret')"), "Échap ferme les détails, la fiche reste")
    bouton_texte("Livraison et retours"); time.sleep(.6)
    verifie(J("document.body.innerText.includes('Colissimo')"), "Livraison et retours s'ouvre")
    dessus = J("(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return !e.closest('.portant-fiche')})()")
    verifie(dessus, "elle passe au-dessus de la fiche")
    echap(); time.sleep(.5)
    verifie(J("!!document.querySelector('.portant-fiche.pret')"), "Échap la ferme, la fiche reste")
    echap(); time.sleep(1.0)
    verifie(J("!document.querySelector('.portant-fiche')") and J("document.body.style.overflow") == "", "Échap ferme la fiche et rend la page")
    verifie(J("document.querySelectorAll('.portant-piece.ouverte').length") == 0, "la pièce est revenue sur le portant")
    hist = J("history.length"); ouvre(1); c.call("Runtime.evaluate", expression="history.back()"); time.sleep(1.1)
    verifie(J("!document.querySelector('.portant-fiche')"), "le retour du navigateur ferme la fiche")
    ouvre(2); bouton_texte("Fermer"); time.sleep(1.1)
    verifie(J("!document.querySelector('.portant-fiche')") and J("!!document.querySelector('.portant')"), "le bouton Fermer ferme la fiche et reste sur la page")
    print("   vrai panier")
    ouvre(5)
    bouton_texte("M"); time.sleep(.25)
    verifie(not J(ACHAT + ".disabled") and "70" in J(ACHAT + ".textContent"), "taille M : le bouton s'active avec le prix", J(ACHAT + ".textContent"))
    clique(".portant-achat"); time.sleep(1.2)
    panier = J("document.body.innerText")
    verifie("Le Minot du Sud" in panier and "70" in panier, "le panier contient Le Minot du Sud, 70 €")
    verifie(J("!document.querySelector('.portant-fiche')"), "la fiche s'est refermée")
    c.shot(CAP + "/d5_panier.png")
    if PAIEMENT:
        lien = J("(()=>{const b=[...document.querySelectorAll('button')].find(b=>/commander|paiement|payer/i.test(b.textContent));if(!b)return null;b.click();return b.textContent.trim()})()")
        print("   bouton du panier :", lien)
        arrive = c.wait("/checkout|checkouts|\\/cart\\//.test(location.href)", 40)
        verifie(arrive, "on arrive sur la page de paiement Shopify", J("location.href"))
        if arrive:
            time.sleep(6)
            t = J("document.body.innerText") or ""
            verifie("Le Minot du Sud" in t, "la page de paiement montre Le Minot du Sud")
            verifie("M" in t and "70" in t, "avec la taille et le prix")
            c.shot(CAP + "/d6_paiement.png")
        c.call("Page.navigate", url="about:blank"); time.sleep(.5)

    print("2. Écran bas d'ordinateur (1280 x 640)")
    ecran(1280, 640); charge(OUVERT); ouvre(6)
    verifie(J("document.querySelector('.portant-achat').getBoundingClientRect().bottom<=innerHeight"), "le bouton d'achat reste visible", J("document.querySelector('.portant-achat').getBoundingClientRect().bottom"))
    c.shot(CAP + "/d7_bas.png")
    echap(); time.sleep(1)

    print("3. Avant l'ouverture : rien à acheter")
    ecran(1440, 900); charge(AVANT)
    verifie(J("[...document.querySelectorAll('.portant-rail .portant-piece')].every(e=>e.dataset.achat==='bientot')"), "les 7 pièces sont en attente")
    ouvre(0)
    verifie(J(ACHAT + ".disabled") and J(ACHAT + ".textContent.trim()") == "Bientôt disponible", "bouton « Bientôt disponible », inactif", J(ACHAT + ".textContent"))
    echap(); time.sleep(1)

    for (w, h) in ((390, 700), (390, 600), (360, 640)):
        print(f"4. Téléphone ({w} x {h})")
        ecran(w, h, tel=True); charge(OUVERT)
        c.call("Page.navigate", url="about:blank"); time.sleep(.2); charge(OUVERT)
        act = lambda: J("document.querySelector('.portant-piece.actif')?.dataset.piece")
        verifie(act() == "ts-petitmatin", "la pièce du milieu est au centre", act())
        verifie(J("getComputedStyle(document.querySelector('.portant-defile')).paddingTop") == "14px", "téléphone : pas de vide ajouté au-dessus de la barre")
        verifie(J("document.documentElement.scrollWidth<=document.documentElement.clientWidth"), "pas de débordement de la page")
        if h == 700: c.shot(CAP + "/t0_portant.png")
        for attendu in ("sw-pleincagnard", "sw-minot"):
            c.call("Input.synthesizeScrollGesture", x=w / 2, y=220, xDistance=-w * .46, yDistance=0, speed=900, gestureSourceType="touch"); time.sleep(1.1)
            verifie(act() == attendu, f"glissement : {attendu} au centre", act())
            verifie(abs(J("(()=>{const r=document.querySelector('.portant-piece.actif').getBoundingClientRect();return r.left+r.width/2})()") - w / 2) < 2, "   pile au milieu")
        x, y = J("(()=>{const r=document.querySelector('.portant-piece.actif').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
        c.call("Input.synthesizeTapGesture", x=x, y=y, gestureSourceType="touch")
        verifie(c.wait("!!document.querySelector('.portant-fiche.pret')", 5), "toucher : la fiche s'ouvre"); time.sleep(.8)
        verifie(J(NOM) == "Le Minot du Sud", "c'est bien Le Minot du Sud", J(NOM))
        if h == 700: c.shot(CAP + "/t1_fiche.png")
        bas = J("document.querySelector('.portant-achat').getBoundingClientRect().bottom")
        verifie(bas <= h, "le bouton d'achat est visible sans défiler", bas)
        verifie(J("document.querySelector('.portant-fiche').scrollWidth<=innerWidth"), "rien ne déborde sur le côté")
        c.call("Input.synthesizeScrollGesture", x=w / 2, y=240, xDistance=-w * .5, yDistance=0, speed=1400, gestureSourceType="touch"); time.sleep(1.0)
        verifie(J(NOM) == "Corps Salé Coeur Solaire", "glisser sur la fiche passe à la pièce suivante", J(NOM))
        if h == 700:
            x, y = J("(()=>{const b=[...document.querySelectorAll('.portant-tailles button')].find(b=>b.textContent==='L');const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
            c.call("Input.synthesizeTapGesture", x=x, y=y, gestureSourceType="touch"); time.sleep(.3)
            verifie(not J(ACHAT + ".disabled"), "toucher une taille active le bouton")
            c.shot(CAP + "/t2_taille.png")
        echap(); time.sleep(1.0)
        verifie(J("!document.querySelector('.portant-fiche')"), "fermeture")
        verifie(act() == "sw-corpssale", "de retour sur le portant, la pièce regardée est au centre", act())
    erreurs = [e["params"]["exceptionDetails"].get("exception", {}).get("description", e["params"]["exceptionDetails"].get("text")) for e in c.events if e.get("method") == "Runtime.exceptionThrown"]
    verifie(not erreurs, "aucune erreur JavaScript", erreurs[:2])
finally:
    c.close(); srv.shutdown(); shutil.rmtree(PUBLIC, ignore_errors=True)
print(f"\n{ok + ko} vérifications, {ko} échec(s) · captures : {CAP}")
sys.exit(1 if ko else 0)
