#!/usr/bin/env python3
"""Build du site Typique.

  python3 tools/build.py

1. Télécharge les outils manquants dans .cache/ (Babel standalone, Tailwind CLI).
2. Compile design_handoff_typique_site/typique-site.jsx avec jsc + Babel.
3. Génère le CSS Tailwind (seules les classes utilisées).
4. Écrit app.js : une variable globale par fichier de photos/ et media/
   (ferret_avant.webp → FERRET_AVANT, hero-720.mp4 → HERO_720) + l'app compilée.
5. Écrit index.html depuis design_handoff_typique_site/template.html.

Chaque fichier référencé porte ?v=<empreinte> : le navigateur peut le garder en cache
indéfiniment (voir vercel.json) et le recharge dès que son contenu change.
"""
import hashlib
import os
import stat
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
BABEL = os.path.join(CACHE, "babel.min.js")
TAILWIND_URL = "https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-macos-x64"
TAILWIND_SHA256 = "6cbdad74be776c087ffa5e9a057512c54898f9fe8828d3362212dfe32fc933a3"
TAILWIND = os.path.join(CACHE, "tailwind", "tailwindcss")
JSX = os.path.join(ROOT, "design_handoff_typique_site", "typique-site.jsx")
TEMPLATE = os.path.join(ROOT, "design_handoff_typique_site", "template.html")
ASSET_DIRS = ["photos", "media"]
FONTS = (
    "https://fonts.googleapis.com/css2"
    "?family=Inter:wght@300;400;500;600"
    "&family=Special+Elite"
    "&family=EB+Garamond:ital,wght@0,400;0,500;1,400"
    "&family=Cormorant:ital,wght@0,400;0,500;1,400"
    "&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600"
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


def compile_jsx():
    res = subprocess.run(
        [JSC, os.path.join(ROOT, "tools", "compile.js"), "--", BABEL, JSX],
        capture_output=True,
    )
    out = res.stdout.decode("utf-8")
    if res.returncode != 0 or not out.strip() or out.startswith("Exception"):
        sys.exit("Erreur de compilation JSX :\n" + out + res.stderr.decode("utf-8"))
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


def main():
    ensure_tools()
    app = asset_vars() + "\n" + compile_jsx()
    with open(os.path.join(ROOT, "app.js"), "w", encoding="utf-8") as f:
        f.write(app)

    html = open(TEMPLATE, encoding="utf-8").read()
    html = html.replace("/*__TAILWIND__*/", tailwind_css()).replace("{{fonts}}", FONTS.replace("&", "&amp;"))
    while "{{asset:" in html:
        start = html.index("{{asset:")
        end = html.index("}}", start)
        html = html[:start] + asset(html[start + 8:end]) + html[end + 2:]
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    kb = lambda s: len(s.encode("utf-8")) // 1024
    print("OK → index.html (%d Ko) + app.js (%d Ko)" % (kb(html), kb(app)))


if __name__ == "__main__":
    main()
