#!/usr/bin/env python3
"""Build du site Typique.

  python3 tools/build.py            # utilise MODE ci-dessous
  python3 tools/build.py boutique   # force un mode

MODE :
  "attente"  → l'accueil (index.html) est la page d'attente du prochain drop ;
               le site complet reste en ligne sur /apercu/ (non référencé par Google).
  "boutique" → l'accueil est le site complet (/apercu/ est retiré).
Rien n'est jamais supprimé du code : on bascule simplement d'un mode à l'autre.

Étapes :
1. Télécharge les outils manquants dans .cache/ (Babel standalone, Tailwind CLI).
2. Compile design_handoff_typique_site/typique-site.jsx avec jsc + Babel.
3. Génère le CSS Tailwind (seules les classes utilisées).
4. Écrit app.js : une variable globale par fichier de photos/ et media/
   (ferret_avant.webp → FERRET_AVANT, hero-720.mp4 → HERO_720) + l'app compilée.
5. Écrit les pages : site complet, page d'attente, mentions légales (/legal/).

Chaque fichier référencé porte ?v=<empreinte> : le navigateur peut le garder en cache
indéfiniment (voir vercel.json) et le recharge dès que son contenu change.
"""
import hashlib
import html as htmllib
import json
import os
import shutil
import stat
import subprocess
import sys
import urllib.request

# ---------- Réglages ----------
MODE = "attente"  # "attente" ou "boutique"
# Adresse qui reçoit les inscriptions aux alertes drop (formulaire Brevo, etc.). Vide = non branché.
ALERTES_ENDPOINT = ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design_handoff_typique_site")
CACHE = os.path.join(ROOT, ".cache")
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
BABEL = os.path.join(CACHE, "babel.min.js")
TAILWIND_URL = "https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-macos-x64"
TAILWIND_SHA256 = "6cbdad74be776c087ffa5e9a057512c54898f9fe8828d3362212dfe32fc933a3"
TAILWIND = os.path.join(CACHE, "tailwind", "tailwindcss")
JSX = os.path.join(SRC, "typique-site.jsx")
ASSET_DIRS = ["photos", "media"]
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


def render(template, extra=None):
    """Remplit un gabarit : {{asset:chemin}}, {{fonts}}, {{fonts_attente}}, {{alertes_endpoint}} + extra."""
    html = open(os.path.join(SRC, template), encoding="utf-8").read()
    values = {
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


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else MODE
    if mode not in ("attente", "boutique"):
        sys.exit('Mode inconnu : %s (attendu : "attente" ou "boutique")' % mode)

    ensure_tools()
    app = asset_vars() + "\n" + jsc("compile.js", BABEL, JSX)
    write(os.path.join(ROOT, "app.js"), app)  # avant render() : son empreinte entre dans le HTML

    boutique = render("template.html", {"/*__TAILWIND__*/": tailwind_css()})
    write(os.path.join(ROOT, "legal", "index.html"), render("legal.html", {"<!--__LEGAL__-->": legal_sections()}))

    if mode == "attente":
        write(os.path.join(ROOT, "index.html"), render("attente.html"))
        noindex = '<meta name="robots" content="noindex, nofollow"/>\n  <title>'
        write(os.path.join(APERCU, "index.html"), boutique.replace("<title>", noindex, 1))
        print("Mode ATTENTE → accueil : page d'attente · site complet : /apercu/")
        if not ALERTES_ENDPOINT:
            print("⚠️  ALERTES_ENDPOINT est vide : les inscriptions ne sont envoyées nulle part.")
    else:
        write(os.path.join(ROOT, "index.html"), boutique)
        if os.path.isdir(APERCU):
            shutil.rmtree(APERCU)
        print("Mode BOUTIQUE → accueil : site complet")

    print("app.js : %d Ko" % (len(app.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
