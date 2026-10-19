#!/usr/bin/env python3
"""Build du site Typique → index.html à la racine du projet.

  python3 tools/build.py

1. Télécharge Babel standalone dans .cache/ s'il manque.
2. Compile design_handoff_typique_site/typique-site.jsx avec jsc + Babel.
3. Déclare une variable globale par photo de photos/ (ferret_avant.jpg → FERRET_AVANT).
4. Injecte le tout dans design_handoff_typique_site/template.html.

Le site déployé = index.html + photos/ + hero-video.mp4.
"""
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
BABEL = os.path.join(ROOT, ".cache", "babel.min.js")
JSX = os.path.join(ROOT, "design_handoff_typique_site", "typique-site.jsx")
TEMPLATE = os.path.join(ROOT, "design_handoff_typique_site", "template.html")
PHOTOS_DIR = os.path.join(ROOT, "photos")
OUT = os.path.join(ROOT, "index.html")


def ensure_babel():
    if os.path.exists(BABEL):
        return
    print("Téléchargement de Babel…")
    os.makedirs(os.path.dirname(BABEL), exist_ok=True)
    urllib.request.urlretrieve(BABEL_URL, BABEL)


def compile_jsx():
    res = subprocess.run(
        [JSC, os.path.join(ROOT, "tools", "compile.js"), "--", BABEL, JSX],
        capture_output=True,
    )
    out = res.stdout.decode("utf-8")
    if res.returncode != 0 or not out.strip() or out.startswith("Exception"):
        sys.exit("Erreur de compilation JSX :\n" + out + res.stderr.decode("utf-8"))
    return out


def photo_vars():
    lines = []
    for name in sorted(os.listdir(PHOTOS_DIR)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue
        lines.append("var %s='/photos/%s';" % (stem.upper(), name))
    return "\n".join(lines)


def main():
    ensure_babel()
    app = compile_jsx()
    html = open(TEMPLATE, encoding="utf-8").read()
    html = html.replace("/*__PHOTOS__*/", photo_vars()).replace("/*__APP__*/", app)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("OK → index.html (%d Ko)" % (len(html.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
