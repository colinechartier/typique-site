"""Test de la page « Livraison et retours » et de la FAQ, en local, sur /apercu/. Rien n'est acheté, rien n'est modifié chez Shopify.

  python3 tools/test_aide.py                       # environ 30 secondes
  python3 tools/test_aide.py --captures DOSSIER    # range aussi les captures d'écran dans ce dossier

Vérifie : les deux liens du pied de page, la fenêtre (onglets, textes, adresses cliquables), le lien dans les fiches et l'ordre des
fenêtres (Échap ferme celle du dessus), les fenêtres légales inchangées, l'absence de tirets longs, et l'affichage sur téléphone.
"""
import http.server, json, os, re, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp import Chrome

PORT, CDP_PORT = 8093, 9336
CAPTURES = sys.argv[sys.argv.index("--captures") + 1] if "--captures" in sys.argv else tempfile.mkdtemp(prefix="typique-captures-aide-")
os.makedirs(CAPTURES, exist_ok=True)

RUBRIQUES_LIVRAISON = ["Livraison à domicile", "Retrait gratuit à Pélissanne", "Livraison locale gratuite", "Retours", "Un souci avec ta commande ?"]
RUBRIQUES_FAQ = ["Quelle taille choisir ?", "Combien coûte la livraison ?", "Quand vais-je recevoir ma commande ?", "Puis-je retourner un article ?",
                 "Et si la taille ne me va pas ?", "Comment entretenir mes pièces ?", "Le paiement est-il sécurisé ?"]
PRIX = "6,90 €"
EMAIL = "typique.fr@gmail.com"


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


# Outils injectés dans la page avant tout le reste : collecte des erreurs JS, recherche de la fenêtre ouverte, clics, touche Échap.
PRELUDE = r"""
window.__erreurs = [];
window.addEventListener('error', e => window.__erreurs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__erreurs.push(String(e.reason)));
window.__modale = () => {
  const p = [...document.querySelectorAll('p')].find(p => ['Aide', 'Informations légales'].includes(p.textContent.trim()));
  return p ? p.closest('div[style*="position: fixed"]') : null;
};
window.__clique = (racine, texte) => {
  const b = [...racine.querySelectorAll('button')].find(b => b.textContent.trim() === texte);
  if (!b) return false;
  b.click();
  return true;
};
window.__echap = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
window.__lecture = () => {
  const m = window.__modale();
  if (!m) return null;
  const boutons = [...m.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t !== '✕');
  const rangee = [...m.querySelectorAll('button')].find(b => b.textContent.trim() !== '✕').parentElement;
  return {
    etiquette: m.querySelector('p').textContent.trim(),
    onglets: boutons,
    titre: m.querySelector('h2').textContent.trim(),
    rubriques: [...m.querySelectorAll('h3')].map(h => h.textContent.trim()),
    texte: m.textContent,
    mails: [...m.querySelectorAll('a[href^="mailto:"]')].map(a => a.getAttribute('href')),
    majLegale: m.textContent.includes('Dernière mise à jour'),
    onglets_debordent: rangee.scrollWidth > rangee.clientWidth + 1,
    bas: m.getBoundingClientRect().bottom,
  };
};
"""

ok_total, ko = 0, []


def verifie(cond, texte):
    global ok_total
    if cond:
        ok_total += 1
        print("  ok  ", texte)
    else:
        ko.append(texte)
        print("  ÉCHEC", texte)


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
profil = tempfile.mkdtemp(prefix="typique-test-aide-")
c = Chrome(profil, port=CDP_PORT)


def js(expr):
    return c.js(expr)


def attendre(expr, t=20):
    return c.wait(expr, t)


def taille(largeur, hauteur, mobile):
    c.call("Emulation.setDeviceMetricsOverride", width=largeur, height=hauteur, deviceScaleFactor=1, mobile=mobile)


def ouvre_apercu():
    c.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/apercu/")
    assert attendre("document.querySelectorAll('article.product-card').length > 0", 40), "les cartes ne s'affichent pas"
    time.sleep(0.5)


def ouvre_fiche():
    """Ouvre la fiche de la première carte affichée (l'onglet par défaut est la nouvelle collection)."""
    js("document.querySelector('article.product-card').click()")


def bouton_pied(texte):
    return js(f"(() => {{ const f = document.querySelector('footer'); return f ? window.__clique(f, {json.dumps(texte)}) : false; }})()")


def ferme_tout():
    for _ in range(3):
        js("window.__echap()")
        time.sleep(0.2)


def aucun_tiret(texte):
    return not re.search("[—–]", texte)


try:
    c.call("Page.enable")
    c.call("Page.addScriptToEvaluateOnNewDocument", source=PRELUDE)

    # ---------- Ordinateur ----------
    print("Ordinateur (1280 x 900)")
    taille(1280, 900, False)
    ouvre_apercu()

    pied = js("[...document.querySelector('footer').querySelectorAll('button')].map(b => b.textContent.trim())") or []
    verifie("Livraison et retours" in pied and "FAQ" in pied, "pied de page : liens « Livraison et retours » et « FAQ » présents")
    verifie(pied.index("Livraison et retours") < pied.index("Mentions légales") if "Mentions légales" in pied else False, "pied de page : placés avant les mentions légales")

    verifie(bouton_pied("Livraison et retours") is True and attendre("!!window.__modale()", 5), "pied de page : « Livraison et retours » ouvre la fenêtre")
    lec = js("window.__lecture()") or {}
    verifie(lec.get("etiquette") == "Aide", "fenêtre d'aide : étiquette « Aide » (et non « Informations légales »)")
    verifie(lec.get("onglets") == ["Livraison et retours", "FAQ"], "fenêtre d'aide : deux onglets seulement (%s)" % lec.get("onglets"))
    verifie(lec.get("titre") == "Livraison et retours", "titre de la page : « Livraison et retours »")
    verifie(lec.get("rubriques") == RUBRIQUES_LIVRAISON, "rubriques de la page : %s" % lec.get("rubriques"))
    texte_liv = lec.get("texte", "")
    verifie(texte_liv.count(PRIX) == 1, "le tarif %s est écrit une fois, avec espace insécable" % PRIX.replace(" ", " "))
    verifie("Colissimo" in texte_liv and "3 à 5 jours ouvrés" in texte_liv and "14 jours" in texte_liv and "100 km" in texte_liv,
            "les règles des CGV sont reprises (Colissimo, 3 à 5 jours ouvrés, 14 jours, 100 km)")
    verifie(not lec.get("majLegale"), "pas de « Dernière mise à jour » sur une page d'aide")
    verifie(lec.get("mails") == ["mailto:" + EMAIL] * 2, "l'adresse email est cliquable aux deux endroits (%s)" % lec.get("mails"))
    c.shot(os.path.join(CAPTURES, "aide-livraison-ordinateur.png"))

    verifie(js("window.__clique(window.__modale(), 'FAQ')") is True, "onglet FAQ cliquable")
    time.sleep(0.3)
    lec_faq = js("window.__lecture()") or {}
    verifie(lec_faq.get("titre") == "Questions fréquentes", "titre de la FAQ : « Questions fréquentes »")
    verifie(lec_faq.get("rubriques") == RUBRIQUES_FAQ, "questions de la FAQ : %s" % lec_faq.get("rubriques"))
    texte_faq = lec_faq.get("texte", "")
    verifie("Le Ferret, L'Entre Deux, Sable chaud" in texte_faq, "FAQ : le conseil de taille nomme les t-shirts du Drop 01")
    verifie(texte_faq.count(PRIX) == 1 and texte_faq.count("30° et à l'envers") == 1, "FAQ : tarif et entretien présents")
    verifie(len(lec_faq.get("mails") or []) == 1, "FAQ : adresse email cliquable")
    c.shot(os.path.join(CAPTURES, "aide-faq-ordinateur.png"))

    pieces_ecrites = texte_liv + "\n" + texte_faq + "\n" + " ".join(pied)
    verifie(aucun_tiret(pieces_ecrites), "aucun tiret long ni moyen dans les textes d'aide et les liens")
    verifie(not re.search(r"à compléter|TODO|undefined|NaN|\$\{", pieces_ecrites), "aucun texte à compléter ni valeur vide")

    js("window.__echap()")
    time.sleep(0.3)
    verifie(js("window.__modale()") is None, "Échap ferme la fenêtre d'aide")
    verifie(js("document.body.style.overflow") == "", "le défilement de la page est rendu")

    bouton_pied("FAQ")
    verifie(attendre("!!window.__modale()", 5) and (js("window.__lecture().titre") == "Questions fréquentes"), "pied de page : « FAQ » ouvre directement la FAQ")
    ferme_tout()

    print("Fenêtres légales (CGV corrigées)")
    bouton_pied("CGV")
    attendre("!!window.__modale()", 5)
    lec = js("window.__lecture()") or {}
    verifie(lec.get("etiquette") == "Informations légales", "CGV : étiquette « Informations légales »")
    verifie(lec.get("onglets") == ["Mentions légales", "CGV", "Confidentialité"], "CGV : trois onglets légaux (%s)" % lec.get("onglets"))
    verifie(lec.get("titre") == "Conditions Générales de Vente" and lec.get("majLegale") is True, "CGV : titre et « Dernière mise à jour » présents")
    verifie(lec.get("mails") == [], "CGV : l'adresse email reste du texte simple (seules les pages d'aide ont des liens)")
    texte_cgv = lec.get("texte", "")
    verifie(texte_cgv.count(PRIX) == 1 and "Colissimo" in texte_cgv and "Apple Pay" in texte_cgv and "Klarna" in texte_cgv, "CGV : tarif Colissimo et moyens de paiement")
    verifie("Retrait : gratuit" in texte_cgv and "Livraison locale : gratuite" in texte_cgv, "CGV : retrait et livraison locale")
    verifie("Modèle de formulaire de rétractation" in texte_cgv and "8. Garanties légales" in texte_cgv, "CGV : modèle de formulaire de rétractation et garanties légales")
    verifie("9. Réclamations" in texte_cgv and "10. Droit applicable" in texte_cgv, "CGV : articles renumérotés (9 et 10)")
    verifie("au plus tard 14 jours après avoir été informés" in texte_cgv, "CGV : remboursement compté à partir de l'information de rétractation")
    verifie(not re.search(r"ec\.europa|plateforme européenne|Aix|Brevo|alerte", texte_cgv), "CGV : plus de plateforme européenne, de tribunal d'Aix ni d'alertes")
    verifie("novembre 2026" in texte_cgv, "CGV : « Dernière mise à jour » : novembre 2026")
    js("window.__clique(window.__modale(), 'Confidentialité')")
    time.sleep(0.3)
    texte_conf = (js("window.__lecture()") or {}).get("texte", "")
    verifie(not re.search(r"Brevo|alerte|consenti|consentement", texte_conf) and "La Poste" in texte_conf, "Confidentialité : plus de Brevo ni d'alertes, Colissimo ajouté")
    js("window.__clique(window.__modale(), 'Mentions légales')")
    time.sleep(0.3)
    texte_ment = (js("window.__lecture()") or {}).get("texte", "")
    verifie(EMAIL in texte_ment, "Mentions légales : adresse de contact")
    verifie(aucun_tiret(texte_cgv + texte_conf + texte_ment), "aucun tiret long ni moyen dans les textes légaux")
    ferme_tout()

    print("Adresse de contact (partout la même)")
    pied_mails = js("[...document.querySelector('footer').querySelectorAll('a[href^=\"mailto:\"]')].map(a => a.getAttribute('href') + ' | ' + a.textContent.trim())") or []
    verifie(pied_mails == ["mailto:%s | %s" % (EMAIL, EMAIL)], "pied de page : une seule adresse, %s (%s)" % (EMAIL, pied_mails))
    verifie("bonjour@typique" not in (js("document.documentElement.outerHTML") or ""), "plus d'adresse bonjour@typique.fr dans la page")

    print("Fiche produit (première carte)")
    ouvre_fiche()
    verifie(attendre("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Livraison et retours →')", 8), "la fiche affiche le lien « Livraison et retours → »")
    js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Livraison et retours →').click()")
    verifie(attendre("!!window.__modale()", 5) and js("window.__lecture().titre") == "Livraison et retours", "le lien de la fiche ouvre « Livraison et retours »")
    sur_dessus = js("""(() => { const m = window.__modale(); const r = m.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && m.contains(el); })()""")
    verifie(sur_dessus is True, "la fenêtre d'aide s'affiche au-dessus de la fiche")
    c.shot(os.path.join(CAPTURES, "fiche-aide-ordinateur.png"))
    js("window.__echap()")
    time.sleep(0.3)
    verifie(js("window.__modale()") is None and js("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Livraison et retours →')") is True,
            "Échap ferme l'aide et laisse la fiche ouverte")
    verifie(js("document.body.style.overflow") == "hidden", "la page derrière la fiche reste bloquée")
    js("window.__echap()")
    time.sleep(0.3)
    verifie(js("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Livraison et retours →')") is False, "un second Échap ferme la fiche")
    verifie(js("document.body.style.overflow") == "", "le défilement de la page est rendu à la fermeture de la fiche")

    # ---------- Téléphone ----------
    print("Téléphone (390 x 844)")
    taille(390, 844, True)
    ouvre_apercu()
    bouton_pied("Livraison et retours")
    attendre("!!window.__modale()", 5)
    lec = js("window.__lecture()") or {}
    verifie(lec.get("onglets_debordent") is False, "les deux onglets tiennent dans la largeur")
    verifie(js("document.documentElement.scrollWidth <= window.innerWidth + 1") is True, "aucun défilement horizontal avec la fenêtre ouverte")
    verifie((lec.get("bas") or 9999) <= 844 + 1, "la fenêtre tient dans l'écran")
    c.shot(os.path.join(CAPTURES, "aide-livraison-telephone.png"))
    js("window.__clique(window.__modale(), 'FAQ')")
    time.sleep(0.3)
    verifie(js("document.documentElement.scrollWidth <= window.innerWidth + 1") is True, "FAQ : aucun défilement horizontal")
    c.shot(os.path.join(CAPTURES, "aide-faq-telephone.png"))
    ferme_tout()

    ouvre_fiche()
    attendre("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Livraison et retours →')", 8)
    js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Livraison et retours →').scrollIntoView({block: 'center'})")
    time.sleep(0.4)
    visible = js("""(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Livraison et retours →');
      const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight; })()""")
    verifie(visible is True, "fiche sur téléphone : le lien est entièrement visible")
    c.shot(os.path.join(CAPTURES, "fiche-lien-telephone.png"))

    erreurs = js("window.__erreurs") or []
    verifie(erreurs == [], "aucune erreur JavaScript (%s)" % erreurs[:3])

    print("Fichiers produits")
    legal_html = open(os.path.join(ROOT, "legal", "index.html"), encoding="utf-8").read()
    verifie("8. Garanties légales" in legal_html and PRIX in legal_html and "${" not in legal_html, "/legal/ : CGV corrigées, tarif écrit, aucune variable non remplacée")
    verifie(not re.search(r"Brevo|ec\.europa|Aix-en-Provence", legal_html), "/legal/ : plus de Brevo, de plateforme européenne ni de tribunal d'Aix")
    for nom in ("app.js", "index.html", os.path.join("apercu", "index.html"), os.path.join("legal", "index.html")):
        verifie("bonjour@typique" not in open(os.path.join(ROOT, nom), encoding="utf-8").read(), "%s : plus d'adresse bonjour@typique.fr" % nom)
finally:
    c.close()
    srv.shutdown()

print()
print("%d vérification(s) réussie(s), %d échec(s)." % (ok_total, len(ko)))
print("Captures : %s" % CAPTURES)
for k in ko:
    print("  - " + k)
sys.exit(1 if ko else 0)
