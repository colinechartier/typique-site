# Images du portant de la nouvelle collection

Chaque pièce (dos et face) est détourée, retouchée au col, posée sur le même cintre et le même cadre (840 x 950, crochet au même endroit).

1. `swiftc -O detoure_full.swift -o detoure_full`, puis détourer chaque photo d'origine vers `full/` : `./detoure_full photo.png full/b1.png`.
2. `python3 -m venv venv && venv/bin/pip install pillow numpy scipy`.
3. `grille.py` trace une grille sur une image pour relever le haut du col (`TOP`, `FILL`) et, côté face, le bord intérieur du col (`FRONT`).
4. `venv/bin/python fabrique.py` écrit `canvas/*.png`.
5. Convertir vers le site : `cwebp -q 86 -alpha_q 95 -m 6 canvas/estaque-dos.png -o ../../photos/portant_estaque_dos.webp`, puis `python3 tools/build.py`.

Dans `fabrique.py` : `a1` à `a4` et `b1` à `b4` sont les faces et dos de L'Estaque, La Pinède, Soleil couchant et Petit matin ; `a7` et `b7` ceux de Corps Salé Coeur Solaire ; `n5a`, `n5b` ceux de Plein cagnard et `n6a`, `n6b` ceux du Minot du Sud (photos « NOUVEAU » du 5/11/2026).
