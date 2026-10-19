#!/usr/bin/env python3
"""Exporte une page animée (ex. reseaux/story-drop02.html) en vidéo MP4.

  python3 -m http.server 8000                         # serveur local, depuis la racine du projet
  python3 tools/render_story.py reseaux/story-drop02.html ~/Desktop/story.mp4 [durée=15] [fps=30]
  python3 tools/render_story.py reseaux/story-drop02.html apercu.png --image 5.2   # une seule image, à t = 5,2 s

La page doit exposer window.__image(t) (dessine l'instant t et attend qu'il soit peint).
Chaque image est capturée par Chrome, puis tools/frames_to_video.swift assemble le MP4.
"""
import base64
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Chrome  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ouvrir(page, profil):
    c = Chrome(profil)
    c.call("Page.enable")
    c.call("Emulation.setDeviceMetricsOverride", width=1080, height=1920, deviceScaleFactor=1, mobile=False)
    c.call("Page.navigate", url="http://127.0.0.1:8000/" + page)
    c.wait("document.readyState === 'complete' && typeof window.__image === 'function'", 60)
    c.js("document.fonts.ready.then(() => true)")
    c.wait("document.getElementById('eau').complete", 60)
    time.sleep(1)
    return c


def main():
    page, sortie = sys.argv[1], os.path.expanduser(sys.argv[2])
    profil = tempfile.mkdtemp(prefix="typique-chrome-")
    if "--image" in sys.argv:
        t = float(sys.argv[sys.argv.index("--image") + 1])
        c = ouvrir(page, profil)
        c.js("window.__image(%f)" % t)
        c.shot(sortie)
        c.close()
        print("Image t=%.2fs → %s" % (t, sortie))
        return

    duree = float(sys.argv[3]) if len(sys.argv) > 3 else 15.0
    fps = int(sys.argv[4]) if len(sys.argv) > 4 else 30
    images = tempfile.mkdtemp(prefix="typique-images-")
    c = ouvrir(page, profil)
    total = int(duree * fps)
    debut = time.time()
    for i in range(total):
        c.js("window.__image(%f)" % (i / fps))
        data = c.call("Page.captureScreenshot", format="jpeg", quality=95)["data"]
        with open(os.path.join(images, "%05d.jpg" % i), "wb") as f:
            f.write(base64.b64decode(data))
        if i % fps == 0:
            print("  %2d s / %d s capturées" % (i // fps, duree), flush=True)
    c.close()
    print("Capture : %.0f s" % (time.time() - debut))
    res = subprocess.run(["swift", os.path.join(ROOT, "tools", "frames_to_video.swift"), images, sortie, str(fps), "12000000"],
                         capture_output=True, text=True)
    print(res.stdout.strip() or res.stderr.strip())
    shutil.rmtree(images, ignore_errors=True)
    shutil.rmtree(profil, ignore_errors=True)


if __name__ == "__main__":
    main()
