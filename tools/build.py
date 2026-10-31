#!/usr/bin/env python3
"""Build du site Typique.

  python3 tools/build.py            # utilise MODE ci-dessous
  python3 tools/build.py attente    # interrupteur de secours : force un mode
  python3 tools/build.py automatique   # arme la bascule automatique (bloc 11)
  python3 tools/build.py --reglage essai.ini   # lit un autre fichier de réglage (pour les essais)

MODE (l'accueil, index.html, a trois états : avant l'ouverture, drop ouvert, après la fermeture) :
  "automatique" → réglage normal : l'accueil passe seul d'un état à l'autre aux heures de reglage-drop.ini,
                  d'après l'heure du serveur (api/heure.js), sans recharger la page.
  "attente"     → secours : la boutique n'est jamais montrée. Page d'attente avant l'ouverture,
                  « boutique fermée pour le moment » pendant le drop, remerciement après.
  "boutique"    → la boutique est toujours montrée (ses boutons d'achat restent réglés sur les dates).
Le site complet reste toujours en ligne sur /apercu/ (non référencé par Google).
Rien n'est jamais supprimé du code : on bascule simplement d'un mode à l'autre.

Étapes :
0. Lit et vérifie reglage-drop.ini (dates du drop, pièces en vente, identifiants Shopify).
   À la moindre erreur la construction s'arrête avant d'écrire quoi que ce soit.
1. Télécharge les outils manquants dans .cache/ (Babel standalone, Tailwind CLI).
2. Compile design_handoff_typique_site/typique-site.jsx avec jsc + Babel.
3. Génère le CSS Tailwind (seules les classes utilisées).
4. Écrit app.js : une variable globale par fichier de photos/ et media/
   (ferret_avant.webp → FERRET_AVANT, hero-720.mp4 → HERO_720), le réglage du drop
   (variable DROP_REGLAGE) + l'app compilée. Écrit boutique.css (styles de base + Tailwind).
5. Écrit les pages : accueil (3 états), site complet (/apercu/), mentions légales (/legal/).
   L'horloge de confiance (horloge.js) est copiée dans l'accueil et dans /apercu/.

Chaque fichier référencé porte ?v=<empreinte> : le navigateur peut le garder en cache
indéfiniment (voir vercel.json) et le recharge dès que son contenu change.
"""
import configparser
import difflib
import hashlib
import html as htmllib
import json
import os
import platform
import re
import stat
import subprocess
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# ---------- Réglages ----------
# Mode du dépôt : "attente" jusqu'au bloc 11, qui passe à "automatique" (l'ouverture du drop ne s'arme qu'à ce moment-là).
# "boutique" : secours. Pour un essai : python3 tools/build.py automatique
MODE = "attente"
MODES = ("automatique", "attente", "boutique")
# Adresse qui reçoit les inscriptions aux alertes drop (formulaire Brevo, etc.). Vide = non branché.
ALERTES_ENDPOINT = ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design_handoff_typique_site")
CACHE = os.path.join(ROOT, ".cache")
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
BABEL = os.path.join(CACHE, "babel.min.js")
# Binaire Tailwind adapté au processeur du Mac (puce Apple ou Intel)
TAILWIND_ARCH = "arm64" if platform.machine() == "arm64" else "x64"
TAILWIND_URL = "https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-macos-" + TAILWIND_ARCH
TAILWIND_SHA256 = {
    "arm64": "a1d0c7985759accca0bf12e51ac1dcbf0f6cf2fffb62e6e0f62d091c477a10a3",
    "x64": "6cbdad74be776c087ffa5e9a057512c54898f9fe8828d3362212dfe32fc933a3",
}[TAILWIND_ARCH]
TAILWIND = os.path.join(CACHE, "tailwind", "tailwindcss-" + TAILWIND_ARCH)
JSX = os.path.join(SRC, "typique-site.jsx")
ASSET_DIRS = ["photos", "media"]
CSS_BASE = "boutique-base.css"
BOUTIQUE_CSS = os.path.join(ROOT, "boutique.css")
# Scripts de la boutique, dans l'ordre où l'accueil les charge
BOUTIQUE_SCRIPTS = ["vendor/react.production.min.js", "vendor/react-dom.production.min.js", "app.js"]
APERCU = os.path.join(ROOT, "apercu")
FONTS = (
    "https://fonts.googleapis.com/css2"
    "?family=Inter:wght@300;400;500;600"
    "&family=Special+Elite"
    "&family=EB+Garamond:ital,wght@0,400;0,500;1,400"
    "&family=Cormorant:ital,wght@0,400;0,500;1,400"
    "&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600"
    "&display=swap"
)
FONTS_ATTENTE = (
    "https://fonts.googleapis.com/css2"
    "?family=Special+Elite"
    "&family=Cormorant:ital,wght@0,400;0,500;1,400;1,500"
    "&family=EB+Garamond:ital,wght@0,400;1,400"
    "&display=swap"
)

# Réglage du drop : dates, pièces en vente, identifiants Shopify (le seul fichier que Coline ouvre).
REGLAGE = os.path.join(ROOT, "reglage-drop.ini")
PARIS = ZoneInfo("Europe/Paris")
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
# Parties du fichier et lignes permises (None : une ligne par pièce, la clé est le nom de la pièce).
SECTIONS = {
    "drop": ("nom", "ouverture", "fermeture"),
    "nouvelle-collection": None,
    "anciennes-pieces": None,
    "site": ("textes-legaux-mis-a-jour",),
}


def ensure_tools():
    if not os.path.exists(BABEL):
        print("Téléchargement de Babel…")
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(BABEL_URL, BABEL)
    if not os.path.exists(TAILWIND):
        print("Téléchargement de Tailwind…")
        os.makedirs(os.path.dirname(TAILWIND), exist_ok=True)
        urllib.request.urlretrieve(TAILWIND_URL, TAILWIND)
        if hashlib.sha256(open(TAILWIND, "rb").read()).hexdigest() != TAILWIND_SHA256:
            os.remove(TAILWIND)
            sys.exit("Somme de contrôle Tailwind invalide : téléchargement supprimé.")
        os.chmod(TAILWIND, os.stat(TAILWIND).st_mode | stat.S_IEXEC)


def jsc(script, *args):
    res = subprocess.run([JSC, os.path.join(ROOT, "tools", script), "--", *args], capture_output=True)
    out = res.stdout.decode("utf-8")
    if res.returncode != 0 or not out.strip() or out.startswith("Exception"):
        sys.exit("Erreur %s :\n%s%s" % (script, out, res.stderr.decode("utf-8")))
    return out


def tailwind_css():
    src = os.path.join(CACHE, "tailwind", "input.css")
    out = os.path.join(CACHE, "tailwind", "output.css")
    with open(src, "w") as f:
        f.write("@tailwind base;\n@tailwind components;\n@tailwind utilities;\n")
    res = subprocess.run(
        [TAILWIND, "-c", os.path.join(ROOT, "tools", "tailwind.config.js"), "-i", src, "-o", out, "--minify"],
        cwd=ROOT, capture_output=True,
    )
    if res.returncode != 0:
        sys.exit("Erreur Tailwind :\n" + res.stderr.decode("utf-8"))
    return open(out, encoding="utf-8").read()


def asset(path):
    data = open(os.path.join(ROOT, path), "rb").read()
    return "/%s?v=%s" % (path, hashlib.sha1(data).hexdigest()[:10])


def asset_vars():
    lines = []
    for folder in ASSET_DIRS:
        for name in sorted(os.listdir(os.path.join(ROOT, folder))):
            stem, ext = os.path.splitext(name)
            if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".mp4"):
                continue
            var = stem.upper().replace("-", "_")
            lines.append("var %s='%s';" % (var, asset(folder + "/" + name)))
    return "\n".join(lines)


def lire_src(nom):
    with open(os.path.join(SRC, nom), encoding="utf-8") as f:
        texte = f.read().rstrip("\n")
    if nom.endswith(".js"):  # script copié dans les pages : sans les lignes de commentaires (moins d'octets à télécharger)
        texte = "\n".join(l for l in texte.split("\n") if not l.lstrip().startswith("//"))
    return texte


def render(template, extra=None):
    """Remplit un gabarit : {{asset:chemin}}, {{fonts}}, {{fonts_attente}}, {{alertes_endpoint}},
    {{horloge}}, {{ecran_css}}, {{ecran_html}} + extra."""
    html = open(os.path.join(SRC, template), encoding="utf-8").read()
    values = {
        "{{horloge}}": lire_src("horloge.js"),
        "{{ecran_css}}": lire_src("ecran-chargement.css"),
        "{{ecran_html}}": lire_src("ecran-chargement.html"),
        "{{fonts}}": FONTS.replace("&", "&amp;"),
        "{{fonts_attente}}": FONTS_ATTENTE.replace("&", "&amp;"),
        "{{alertes_endpoint}}": ALERTES_ENDPOINT,
        **(extra or {}),
    }
    for key, value in values.items():
        html = html.replace(key, value)
    while "{{asset:" in html:
        start = html.index("{{asset:")
        end = html.index("}}", start)
        html = html[:start] + asset(html[start + 8:end]) + html[end + 2:]
    return html


def legal_sections():
    data = json.loads(jsc("extract_legal.js", JSX))
    parts = []
    for key in ("mentions", "confidentialite", "cgv"):
        doc = data[key]
        parts.append('    <section id="%s">\n      <h2>%s</h2>' % (key, htmllib.escape(doc["title"])))
        for s in doc["sections"]:
            parts.append("      <h3>%s</h3>\n      <p>%s</p>" % (htmllib.escape(s["heading"]), htmllib.escape(s["text"])))
        parts.append("    </section>")
    return "\n".join(parts)


def sans_accent(texte):
    """Pour comparer des noms de pièces sans tenir compte des accents, des majuscules ni de la forme de l'apostrophe."""
    texte = texte.replace("’", "'").replace("œ", "oe").replace("Œ", "oe")
    texte = unicodedata.normalize("NFKD", texte)
    return " ".join("".join(c for c in texte if not unicodedata.combining(c)).lower().split())


def catalogue_jsx():
    """Les pièces que le site connaît, [(identifiant, nom)], lues dans le tableau `catalogue` du .jsx."""
    src = open(JSX, encoding="utf-8").read()
    bloc = re.search(r"const catalogue = \[(.*?)\n  \];", src, re.S)
    pieces = []
    if bloc:
        for ident, double, simple in re.findall(r"""\bid: '([\w-]+)'.*?\bname: (?:"([^"]*)"|'([^']*)')""", bloc.group(1), re.S):
            pieces.append((ident, double or simple))
    if not pieces:
        sys.exit("Erreur : le tableau `catalogue` des pièces est introuvable dans typique-site.jsx.")
    return pieces


def jour_fr(d, avec_mois=True):
    """« vendredi 6 novembre » (le 1er du mois s'écrit « 1er »). Espace insécable entre le numéro et le mois :
    la date ne se coupe pas en fin de ligne."""
    numero = "1er" if d.day == 1 else str(d.day)
    return "%s %s%s" % (JOURS[d.weekday()], numero, " " + MOIS[d.month - 1] if avec_mois else "")


def quand_fr(dt):
    """« le vendredi 6 novembre à 12 h ». Pour minuit juste, la nuit est dite en toutes lettres
    pour éviter tout doute : « à minuit, dans la nuit du jeudi 26 au vendredi 27 novembre »."""
    if dt.hour == 0 and dt.minute == 0:
        veille = dt - timedelta(days=1)
        return "à minuit, dans la nuit du %s au %s" % (jour_fr(veille, veille.month != dt.month), jour_fr(dt))
    heure = "%d h" % dt.hour + (" %02d" % dt.minute if dt.minute else "")
    return "le %s à %s" % (jour_fr(dt), heure)


def lire_reglage(chemin):
    """Lit et vérifie le fichier de réglage. À la moindre erreur : un message clair en français et l'arrêt,
    avant d'écrire quoi que ce soit. Retourne les dates (heure de Paris) et les pièces en vente."""
    fichier = os.path.basename(chemin)

    def stop(message):
        sys.exit("\nERREUR dans %s : %s\nLa construction est arrêtée : le site n'a pas été modifié.\n" % (fichier, message))

    if not os.path.exists(chemin):
        stop("fichier introuvable (%s)." % chemin)
    ini = configparser.ConfigParser(delimiters=("=",), comment_prefixes=("#",), inline_comment_prefixes=("#",), interpolation=None)
    ini.optionxform = str  # garde les majuscules des noms de pièces
    try:
        ini.read_string(open(chemin, encoding="utf-8-sig").read(), source=fichier)
    except configparser.MissingSectionHeaderError as e:
        stop("ligne %d : « %s » est avant la première partie. Une partie s'écrit entre crochets, par exemple [drop]." % (e.lineno, e.line.strip()))
    except configparser.DuplicateSectionError as e:
        stop("la partie [%s] est écrite deux fois (ligne %s)." % (e.section, e.lineno))
    except configparser.DuplicateOptionError as e:
        stop("ligne %s : « %s » est écrit deux fois dans [%s]." % (e.lineno, e.option, e.section))
    except configparser.ParsingError as e:
        # configparser rend la ligne entre guillemets, avec son « \n » final : on l'enlève
        stop("; ".join("ligne %d : « %s » n'est pas de la forme « nom = valeur »" % (n, ligne.strip().strip("'\"").replace("\\n", "").strip())
                       for n, ligne in e.errors) + ".")
    except configparser.Error as e:
        stop(str(e))

    for section in ini.sections():
        if section not in SECTIONS:
            stop("partie inconnue [%s]. Parties attendues : %s." % (section, ", ".join("[%s]" % s for s in SECTIONS)))
    for section, cles in SECTIONS.items():
        if not ini.has_section(section):
            stop("la partie [%s] est absente." % section)
        if cles is None:
            continue
        for cle in ini[section]:
            if cle not in cles:
                proche = difflib.get_close_matches(cle, cles, n=1)
                stop("[%s] : la ligne « %s » est inconnue.%s Lignes attendues : %s." % (
                    section, cle, " Tu voulais dire « %s » ?" % proche[0] if proche else "", ", ".join(cles)))
        for cle in cles:
            if not ini[section].get(cle, "").strip():
                stop("[%s] : la ligne « %s = ... » est absente ou vide." % (section, cle))

    def heure(cle):
        texte = ini["drop"][cle].strip()
        try:
            local = datetime.strptime(texte, "%Y-%m-%d %H:%M")
        except ValueError:
            stop("[drop] %s = %s : date ou heure impossible. Écris-la ainsi : 2026-11-06 12:00 "
                 "(année-mois-jour heure:minute, minuit = 00:00)." % (cle, texte))
        dt = local.replace(tzinfo=PARIS)
        if dt.astimezone(timezone.utc).astimezone(PARIS).replace(tzinfo=None) != local:
            stop("[drop] %s = %s : cette heure n'existe pas à Paris (passage à l'heure d'été)." % (cle, texte))
        return dt

    ouverture, fermeture = heure("ouverture"), heure("fermeture")
    if fermeture.timestamp() <= ouverture.timestamp():
        stop("[drop] la fermeture (%s) doit venir après l'ouverture (%s)." % (ini["drop"]["fermeture"], ini["drop"]["ouverture"]))

    connues = catalogue_jsx()
    par_nom = {sans_accent(nom): (ident, nom) for ident, nom in connues}

    def pieces(section):
        lues = []
        for cle, valeur in ini[section].items():
            trouvee = par_nom.get(sans_accent(cle))
            if not trouvee:
                proche = difflib.get_close_matches(sans_accent(cle), list(par_nom), n=1, cutoff=0.6)
                aide = " Tu voulais dire « %s » ?" % par_nom[proche[0]][1] if proche else " Pièces connues : %s." % ", ".join(n for _, n in connues)
                stop("[%s] : la pièce « %s » n'existe pas sur le site.%s" % (section, cle, aide))
            ident, nom = trouvee
            valeur = valeur.strip()
            if valeur and not re.fullmatch(r"[0-9]+", valeur):
                stop("[%s] : « %s = %s » : l'identifiant Shopify doit être un nombre (ou rester vide)." % (section, cle, valeur))
            lues.append((ident, nom, valeur))
        return lues

    nouvelles, anciennes = pieces("nouvelle-collection"), pieces("anciennes-pieces")
    listees = {}
    for section, liste in (("nouvelle-collection", nouvelles), ("anciennes-pieces", anciennes)):
        for ident, nom, _ in liste:
            if ident in listees:
                ou = "dans [%s]" % section if listees[ident] == section else "dans [%s] et dans [%s]" % (listees[ident], section)
                stop("la pièce « %s » est écrite deux fois (%s)." % (nom, ou))
            listees[ident] = section
    if not listees:
        stop("aucune pièce en vente : la boutique serait vide.")

    return {
        "nom": ini["drop"]["nom"].strip(),
        "ouverture": ouverture,
        "fermeture": fermeture,
        "nouvelles": nouvelles,
        "anciennes": anciennes,
        "cachees": [nom for ident, nom in connues if ident not in listees],
        "textes_legaux": ini["site"]["textes-legaux-mis-a-jour"].strip(),
    }


def resume_reglage(r, chemin):
    print("Réglage lu (%s) : %s" % (os.path.basename(chemin), r["nom"]))
    print("  Ouverture : %s" % quand_fr(r["ouverture"]))
    print("  Fermeture : %s" % quand_fr(r["fermeture"]))
    for titre, liste in (("Nouvelle collection", r["nouvelles"]), ("Anciennes pièces", r["anciennes"])):
        sans_id = [nom for _, nom, sid in liste if not sid]
        print("  %s : %d pièce(s), %d avec identifiant Shopify" % (titre, len(liste), len(liste) - len(sans_id)))
        if sans_id:
            print("    « Bientôt disponible », sans bouton d'achat : " + ", ".join(sans_id))
    if r["cachees"]:
        print("  Pièces du site absentes du fichier, donc cachées : " + ", ".join(r["cachees"]))


def reglage_js(r):
    """Ce dont le navigateur a besoin, en tête de app.js : variable DROP_REGLAGE (heures avec leur décalage de Paris)."""
    data = {
        "nom": r["nom"],
        "ouverture": r["ouverture"].isoformat(),
        "fermeture": r["fermeture"].isoformat(),
        "ouvertureTexte": quand_fr(r["ouverture"]),
        "fermetureTexte": quand_fr(r["fermeture"]),
        "nouvelleCollection": [ident for ident, _, _ in r["nouvelles"]],
        "anciennesPieces": [ident for ident, _, _ in r["anciennes"]],
        "shopifyIds": {ident: sid for ident, _, sid in r["nouvelles"] + r["anciennes"] if sid},
        "textesLegauxMisAJour": r["textes_legaux"],
    }
    return "var DROP_REGLAGE=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"


def accueil_json(r, mode):
    """Ce dont l'accueil a besoin avant même de charger la boutique : mode, heures (en ms), textes de date et
    adresses des fichiers de la boutique (avec leur empreinte). Écrit dans la page, protégé pour un <script>."""
    data = {
        "nom": r["nom"],
        "mode": mode,
        "ouverture": int(r["ouverture"].timestamp() * 1000),
        "fermeture": int(r["fermeture"].timestamp() * 1000),
        "ouvertureTexte": quand_fr(r["ouverture"]),
        "ressources": {
            "css": asset("boutique.css"),
            "scripts": [asset(chemin) for chemin in BOUTIQUE_SCRIPTS],
            "fontes": FONTS,
        },
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("<!--", "<\\!--")


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    args = sys.argv[1:]
    chemin_reglage = REGLAGE
    if "--reglage" in args:
        i = args.index("--reglage")
        if i + 1 >= len(args):
            sys.exit("--reglage attend le chemin d'un fichier.")
        chemin_reglage = os.path.abspath(args[i + 1])
        del args[i:i + 2]
    mode = args[0] if args else MODE
    if mode not in MODES:
        sys.exit('Mode inconnu : %s (attendu : "automatique", "attente" ou "boutique")' % mode)

    reglage = lire_reglage(chemin_reglage)  # d'abord : une erreur arrête tout avant d'écrire le moindre fichier
    resume_reglage(reglage, chemin_reglage)

    ensure_tools()
    app = asset_vars() + "\n" + reglage_js(reglage) + "\n" + jsc("compile.js", BABEL, JSX)
    write(os.path.join(ROOT, "app.js"), app)  # avant render() : son empreinte entre dans le HTML
    write(BOUTIQUE_CSS, lire_src(CSS_BASE) + "\n" + tailwind_css())

    write(os.path.join(ROOT, "legal", "index.html"), render("legal.html", {"<!--__LEGAL__-->": legal_sections()}))
    write(os.path.join(ROOT, "index.html"), render("accueil.html", {
        "{{drop_nom}}": htmllib.escape(reglage["nom"]),
        "{{drop_ouverture}}": htmllib.escape(quand_fr(reglage["ouverture"])),
        "{{drop_json}}": accueil_json(reglage, mode),
    }))
    noindex = '<meta name="robots" content="noindex, nofollow"/>\n  <title>'
    write(os.path.join(APERCU, "index.html"), render("template.html").replace("<title>", noindex, 1))
    print("Mode %s → accueil : %s · site complet : /apercu/" % (mode.upper(), {
        "automatique": "attente, boutique, attente selon l'heure du serveur",
        "attente": "page d'attente seule (la boutique n'est jamais montrée)",
        "boutique": "boutique toujours montrée",
    }[mode]))
    if not ALERTES_ENDPOINT:
        print("⚠️  ALERTES_ENDPOINT est vide : les inscriptions ne sont envoyées nulle part.")

    print("app.js : %d Ko" % (len(app.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
