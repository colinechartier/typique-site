"""Fabrique les icônes du site à partir de sources/favicon-original.svg.

Usage : python3 tools/fabrique_icones.py
Écrit à la racine : favicon.ico (16, 32 et 48 px), icon-192.png, apple-touch-icon.png (180 px, carré plein, iOS arrondit lui-même).
L'original embarque la police du « t » (200 Ko) : il reste dans sources/ et n'est pas publié, seules les icônes le sont (quelques Ko).
Chrome sans écran dessine chaque taille directement, sans réduire une grande image.
"""
import base64, os, struct, sys, tempfile, time

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)
from cdp import Chrome

SOURCE = os.path.join(RACINE, "sources", "favicon-original.svg")
ENTETE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'


def dessiner(chrome, svg, taille, arrondi, dossier):
    """Renvoie le PNG de l'icône à cette taille (fond transparent autour des coins arrondis)."""
    assert ENTETE_SVG in svg, "Le début de l'original a changé : adapter ENTETE_SVG."
    svg = svg.replace(ENTETE_SVG, ENTETE_SVG[:-1] + f' width="{taille}" height="{taille}" style="display:block">')
    if not arrondi:
        svg = svg.replace('rx="6"', 'rx="0"')
    page = os.path.join(dossier, f"icone-{taille}-{'arrondie' if arrondi else 'carree'}.html")
    open(page, "w", encoding="utf-8").write(f'<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">{svg}')
    chrome.call("Emulation.setDeviceMetricsOverride", width=taille, height=taille, deviceScaleFactor=1, mobile=False)
    chrome.call("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})
    chrome.call("Page.navigate", url="file://" + page)
    chrome.wait("document.readyState === 'complete'", timeout=20)
    # sans la police du « t », le dessin serait faux : on s'arrête plutôt que d'écrire une mauvaise icône
    if chrome.js("document.fonts.load('22px SE').then(f => f.length)") != 1:
        raise SystemExit("La police de l'icône n'a pas été chargée : rien n'a été écrit.")
    time.sleep(0.4)
    png = base64.b64decode(chrome.call("Page.captureScreenshot", format="png", fromSurface=True)["data"])
    assert struct.unpack(">II", png[16:24]) == (taille, taille), f"Taille inattendue pour l'icône {taille}"
    return png


def fabriquer_ico(pngs):
    """Assemble un .ico à partir de PNG [(taille, octets)] (accepté par tous les navigateurs actuels)."""
    entetes, donnees, decalage = b"", b"", 6 + 16 * len(pngs)
    for taille, png in pngs:
        entetes += struct.pack("<BBBBHHII", taille, taille, 0, 0, 1, 32, len(png), decalage)
        donnees += png
        decalage += len(png)
    return struct.pack("<HHH", 0, 1, len(pngs)) + entetes + donnees


svg = open(SOURCE, encoding="utf-8").read()
with tempfile.TemporaryDirectory() as tmp:
    chrome = Chrome(os.path.join(tmp, "profil"), port=9342)
    try:
        petites = [(t, dessiner(chrome, svg, t, True, tmp)) for t in (16, 32, 48)]
        grande = dessiner(chrome, svg, 192, True, tmp)
        apple = dessiner(chrome, svg, 180, False, tmp)
    finally:
        chrome.close()

for nom, octets in (("favicon.ico", fabriquer_ico(petites)), ("icon-192.png", grande), ("apple-touch-icon.png", apple)):
    open(os.path.join(RACINE, nom), "wb").write(octets)
    print(f"{nom} : {len(octets) / 1024:.1f} Ko")
