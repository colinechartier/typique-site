"""Test croisé de la vraie adresse (www.boutiquetypique.fr) dans Chrome, Safari (moteur WebKit, ordinateur et iPhone) et Firefox.

Installation, une seule fois, dans un dossier à part (rien n'est ajouté au projet) :
  python3 -m venv ~/outil-test && ~/outil-test/bin/pip install playwright && ~/outil-test/bin/playwright install webkit firefox
Usage : ~/outil-test/bin/python tools/test_navigateurs.py [chrome-pc] [chrome-tel] [safari-pc] [safari-iphone] [firefox-pc]
Les captures vont dans le dossier temporaire du Mac. Dates et textes attendus : ceux du drop du 6 novembre 2026, à adapter ensuite.
Limites : le WebKit de Playwright n'est pas le vrai Safari et refuse toute lecture automatique de vidéo, même sur une page de contrôle :
la vidéo de fond n'y est qu'un renseignement. Le vrai Safari et l'iPhone se regardent à l'oeil.
"""
import datetime
import os
import re
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

from test_navigateurs_aide import defiler, lire_video

BASE = "https://www.boutiquetypique.fr"
SCR = os.path.join(tempfile.gettempdir(), "typique-test-navigateurs")  # captures d'écran
os.makedirs(SCR, exist_ok=True)
OUVERTURE = datetime.datetime(2026, 11, 6, 12, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=1)))

JS_OVERLAY = """() => {
  const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /bientôt disponible/i.test(e.textContent));
  let o = el; while (o && getComputedStyle(o).position !== 'fixed') o = o.parentElement;
  return o;
}"""


def norm(t):
    return re.sub(r"\s+", " ", (t or "").replace(" ", " ").replace(" ", " ")).strip()


class Rapport:
    def __init__(self):
        self.lignes, self.ko = [], 0

    def verifier(self, condition, texte, detail=""):
        if not condition:
            self.ko += 1
        suite = f" ({detail})" if detail else ""
        self.lignes.append(("  ok  " if condition else "  KO  ") + texte + suite)

    def info(self, texte):
        self.lignes.append("  ..  " + texte)


def essai(r, nom, fonction):
    try:
        fonction()
    except Exception as e:
        r.verifier(False, f"{nom} : le test a planté", repr(e)[:170].replace("\n", " "))


def tester(p, etiquette, fichier, moteur, lancement, contexte):
    r = Rapport()
    navigateur = getattr(p, moteur).launch(**lancement)
    page = navigateur.new_context(**contexte).new_page()
    erreurs, echecs = [], []
    page.on("console", lambda m: erreurs.append(f"[{page.url.replace(BASE, '')[:14]}] " + m.text[:110]) if m.type == "error" and "Button failed to load" not in m.text else None)  # bruit interne de WebKit
    page.on("pageerror", lambda e: erreurs.append("JS : " + str(e)[:130]))
    page.on("requestfailed", lambda q: echecs.append(f"{q.url[-55:]} {q.failure}") if not re.search(r"abort|cancel", str(q.failure), re.I) else None)
    page.on("response", lambda s: echecs.append(f"{s.status} {s.url[-55:]}") if s.status >= 400 else None)
    jeton = str(int(time.time()))

    def accueil():
        page.goto(f"{BASE}/?x={jeton}", wait_until="load", timeout=60000)
        page.wait_for_timeout(3500)
        t = norm(page.inner_text("body"))
        r.verifier(page.title() == "Typique : le prochain drop arrive très bientôt", "page d'attente : titre de l'onglet", page.title())
        r.verifier(re.search(r"ouverture le vendredi 6 novembre à 12 h", t, re.I) is not None, "page d'attente : « Ouverture le vendredi 6 novembre à 12 h »")
        r.verifier(page.locator('a[href*="instagram.com/typique.fr"]:visible').count() >= 1, "page d'attente : bouton Instagram visible")
        r.verifier(page.locator("input:visible").count() == 0 and not re.search(r"me prévenir", t, re.I), "page d'attente : aucun champ ni formulaire visible")
        r.verifier(not re.search(r"NaN|Invalid Date|undefined", t), "page d'attente : pas de NaN ni de date invalide")
        r.verifier(page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 1, "page d'attente : pas de défilement horizontal")
        lire_video(page, r, "page d'attente")
        page.screenshot(path=f"{SCR}/xnav-{fichier}-accueil.png")

    essai(r, "page d'attente", accueil)

    def apercu():
        t0 = time.time()
        page.goto(f"{BASE}/apercu/?x={jeton}", wait_until="load", timeout=60000)
        page.wait_for_selector("#pieces img", timeout=30000)
        photos_pretes = "[...document.querySelectorAll('#pieces img')].filter(i => i.complete && i.naturalWidth > 0).length"
        avant = page.evaluate(photos_pretes)
        defiler(page)
        page.wait_for_function(photos_pretes + " >= 7", timeout=40000)
        r.info(f"/apercu/ (réseau non bridé) : {avant}/7 photos prêtes avant de défiler (chargement différé), 7/7 après avoir défilé, en {int((time.time() - t0) * 1000)} ms")
        lire_video(page, r, "aperçu")
        page.wait_for_timeout(1000)

        def decompte():
            m = re.search(r"(\d+) jours? (\d+) heures? (\d+) min (\d+) sec", norm(page.inner_text("body")), re.I)
            return int(m.group(1)) * 86400 + int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4)) if m else None

        d1 = decompte()
        attendu = (OUVERTURE - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
        r.verifier(d1 is not None and abs(d1 - attendu) <= 5, "aperçu : décompte juste jusqu'au 6 novembre à 12 h", f"affiché {d1} s, attendu {int(attendu)} s")
        page.wait_for_timeout(2300)
        d2 = decompte()
        r.verifier(d1 is not None and d2 is not None and 1 <= d1 - d2 <= 4, "aperçu : le décompte avance seconde après seconde", f"{d1} puis {d2}")

        info = page.evaluate("""() => { const im = [...document.querySelectorAll('#pieces img')];
            return { total: im.length, ok: im.filter(i => i.complete && i.naturalWidth > 0).length, texte: document.querySelector('#pieces').innerText }; }""")
        t = norm(info["texte"])
        r.verifier(info["total"] == 7 and info["ok"] == 7, "aperçu : 7 photos de la nouvelle collection affichées", f"{info['ok']}/{info['total']}")
        r.verifier(len(re.findall(r"bientôt", t, re.I)) == 7, "aperçu : 7 pièces en « Bientôt »", str(len(re.findall(r"bientôt", t, re.I))))
        r.verifier(not re.search(r"ajouter au panier|\+ panier|commander", t, re.I), "aperçu : aucun bouton d'achat avant l'ouverture")
        page.locator("#pieces button:has-text('›')").first.click(timeout=8000)
        page.wait_for_timeout(600)
        r.verifier("arriere" in page.evaluate("document.querySelector('#pieces img').src"), "aperçu : la flèche d'une carte montre le dos de la pièce")

        for onglet in ("T-shirts", "Manches longues", "Hoodies", "Accessoires"):
            page.locator("button", has_text=re.compile(rf"^\s*{re.escape(onglet)}\s*$", re.I)).first.click(timeout=8000)
            page.wait_for_timeout(1200)
            defiler(page)  # les photos hors écran se chargent au défilement
            page.locator("#pieces").scroll_into_view_if_needed()
            d = page.evaluate("""() => { const im = [...document.querySelectorAll('#pieces img')].filter(i => i.getBoundingClientRect().width > 100);
                return { total: im.length, ok: im.filter(i => i.complete && i.naturalWidth > 0).length, texte: document.querySelector('#pieces').innerText }; }""")
            tt = norm(d["texte"])
            prix = len(re.findall(r"\d+(?:,\d{2})? ?€", tt))
            r.verifier(d["total"] >= 1 and d["ok"] == d["total"] and "Prix et tailles non chargés" not in tt, f"onglet {onglet} : photos et prix lus dans Shopify",
                       f"{d['ok']}/{d['total']} photos, {prix} prix")
        page.locator("button", has_text=re.compile(r"^\s*Nouvelle collection\s*$", re.I)).first.click(timeout=8000)
        page.wait_for_timeout(1200)

        # fiche détaillée
        page.locator("#pieces img").first.click(timeout=8000)
        page.get_by_text(re.compile("bientôt disponible", re.I)).first.wait_for(state="visible", timeout=8000)
        page.wait_for_timeout(900)
        overlay = page.evaluate_handle(JS_OVERLAY).as_element()
        r.verifier(overlay is not None, "fiche : la fiche de L'Estaque s'ouvre")
        if overlay:
            image = overlay.query_selector("img")
            avant = image.evaluate("i => i.currentSrc")
            r.verifier(image.evaluate("i => i.complete && i.naturalWidth > 0"), "fiche : la grande photo est affichée")
            page.screenshot(path=f"{SCR}/xnav-{fichier}-fiche.png")
            fleche = overlay.query_selector("button:has-text('›')")
            if fleche:
                fleche.click()
                page.wait_for_timeout(900)
                apres = overlay.query_selector("img").evaluate("i => i.currentSrc")
                r.verifier(apres != avant and "arriere" in apres, "fiche : la flèche montre le dos de la pièce")
            else:
                r.info("fiche : pas de flèche trouvée")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
            if page.get_by_text(re.compile("bientôt disponible", re.I)).first.is_visible():
                bouton = overlay.query_selector("button[aria-label*='erm' i], button:has-text('×'), button:has-text('✕')")
                if bouton:
                    bouton.click()
                    page.wait_for_timeout(600)
            r.verifier(not page.get_by_text(re.compile("bientôt disponible", re.I)).first.is_visible(), "fiche : elle se referme")

        # section alertes et pied de page
        page.locator("#alertes").scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        r.verifier(page.locator('#alertes a[href="https://www.instagram.com/typique.fr"]:visible').count() == 1, "aperçu : bouton Instagram visible dans la section « Alertes »")
        r.verifier(page.locator("#alertes input, #alertes form").count() == 0, "aperçu : plus de formulaire d'inscription")
        page.screenshot(path=f"{SCR}/xnav-{fichier}-alertes.png")
        r.verifier("© typique 2026 · entre sel et soleil" in norm(page.inner_text("footer")), "pied de page : « © typique 2026 · entre sel et soleil »")
        r.verifier(not re.search("[—–]", norm(page.inner_text("body"))), "aperçu : aucun tiret long ou moyen dans le texte")
        r.verifier(page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 1, "aperçu : pas de défilement horizontal")

        # fenêtres légales : chacune avec ce qu'elle doit contenir
        for lien, attendus in (("Mentions légales", ["USA (vercel.com)"]),
                               ("CGV", ["Coline Chartier, Typique", "4. Commandes : modèle drop"]),
                               ("Confidentialité", ["• Traiter et expédier vos commandes", "conservée par Typique. Le paiement est traité par Shopify Payments ou par le service de paiement que vous choisissez","Vercel Inc. (hébergement), conforme RGPD"])):
            page.locator("footer button", has_text=re.compile(rf"^\s*{re.escape(lien)}\s*$", re.I)).first.click(timeout=8000)
            page.wait_for_timeout(1200)
            texte = norm(page.inner_text("body"))
            manque = [a for a in attendus if a.lower() not in texte.lower()]  # les titres sont en capitales à l'écran
            r.verifier(not manque and not re.search("[—–]", texte), f"fenêtre « {lien} » : s'ouvre, texte corrigé, aucun tiret", "manque : " + " | ".join(manque) if manque else "")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
        # grille, pour la capture
        page.locator("#pieces").scroll_into_view_if_needed()
        page.evaluate("document.querySelector('#pieces').scrollIntoView()")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SCR}/xnav-{fichier}-grille.png")

    essai(r, "aperçu", apercu)

    def legal():
        page.goto(f"{BASE}/legal/?x={jeton}", wait_until="load", timeout=60000)
        t = norm(page.inner_text("body"))
        r.verifier(page.title() == "Typique : mentions légales & confidentialité", "/legal/ : titre de l'onglet", page.title())
        r.verifier("• Traiter et expédier vos commandes" in t and "Coline Chartier, Typique" in t, "/legal/ : puces et texte corrigés")

    essai(r, "/legal/", legal)

    r.verifier(not erreurs, "console : aucune erreur JavaScript", " | ".join(erreurs[:3]))
    r.verifier(not echecs, "réseau : aucune requête en échec ni en erreur 4xx ou 5xx", " | ".join(echecs[:3]))
    version = navigateur.version
    navigateur.close()
    print(f"\n=== {etiquette} (moteur {moteur} {version}) : {r.ko} point(s) KO ===")
    print("\n".join(r.lignes))
    return r.ko


with sync_playwright() as p:
    iphone = {k: v for k, v in (p.devices.get("iPhone 15") or p.devices["iPhone 14"]).items() if k != "default_browser_type"}
    profils = [
        ("Chrome (le vrai, installé sur ton Mac) · ordinateur", "chrome-pc", "chromium", {"channel": "chrome"}, {"viewport": {"width": 1280, "height": 900}}),
        ("Chrome · écran de téléphone 390x844", "chrome-tel", "chromium", {"channel": "chrome"}, {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 3, "is_mobile": True, "has_touch": True}),
        ("Safari (moteur WebKit) · ordinateur", "safari-pc", "webkit", {}, {"viewport": {"width": 1280, "height": 900}}),
        ("Safari (moteur WebKit) · iPhone", "safari-iphone", "webkit", {}, iphone),
        ("Firefox · ordinateur", "firefox-pc", "firefox", {}, {"viewport": {"width": 1280, "height": 900}}),
    ]
    choix = sys.argv[1:]
    total_ko = 0
    for etiquette, fichier, moteur, lancement, contexte in profils:
        if choix and fichier not in choix:
            continue
        try:
            total_ko += tester(p, etiquette, fichier, moteur, lancement, contexte)
        except Exception as e:
            total_ko += 1
            print(f"\n=== {etiquette} : IMPOSSIBLE À LANCER : {repr(e)[:250]} ===")
    print(f"\nTOTAL : {total_ko} point(s) KO sur l'ensemble des navigateurs")
