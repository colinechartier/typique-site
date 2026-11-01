def defiler(page, pas=500):
    """Fait défiler la page de haut en bas comme un visiteur, pour déclencher les chargements différés."""
    y = 0
    for _ in range(80):
        if y >= page.evaluate("document.body.scrollHeight"):
            break
        y += pas
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(300)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(400)


def lire_video(page, r, nom):
    """Vidéo de fond : en erreur (KO), sinon un renseignement sur son état."""
    v = page.evaluate("""() => { const v = document.querySelector('video'); if (!v) return null;
        return { etat: v.readyState, erreur: v.error ? v.error.code : null, pause: v.paused, t: v.currentTime,
                 source: (v.currentSrc || '').split('/').pop().split('?')[0], largeur: v.videoWidth }; }""")
    if v is None:
        r.info(f"{nom} : pas de vidéo dans la page")
        return
    page.wait_for_timeout(1500)
    t1 = page.evaluate("document.querySelector('video').currentTime")
    marche = "en lecture" if t1 > v["t"] else ("en pause" if v["pause"] else "ne progresse pas")
    if v["erreur"] is not None:
        r.verifier(False, f"{nom} : la vidéo de fond est en erreur", f"code {v['erreur']}")
    else:
        r.info(f"{nom} : vidéo {v['source'] or '(pas de source)'} {marche}, prête {v['etat']}/4, largeur {v['largeur']} px")
