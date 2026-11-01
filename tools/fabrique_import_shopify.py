#!/usr/bin/env python3
"""Fabrique le fichier d'import Shopify des pièces d'un drop : un produit en brouillon par pièce, une variante par taille.

Rien n'est envoyé nulle part : le script lit deux fichiers et en écrit un.
  - DROP02-A-REMPLIR.md : type, prix, tailles et stock de chaque pièce (la fiche de Coline, jamais publiée) ;
  - design_handoff_typique_site/typique-site.jsx : nom, description et photos de chaque pièce (celles du site,
    pour que Shopify et le site disent la même chose).
Écrit import-shopify-drop02.csv à la racine. Ce fichier est dans .gitignore et .vercelignore : les prix ne sont
pas publics avant le drop.

Réglages repris du Drop 01 tel qu'il est dans Shopify : option « Taille », fabricant « Typique », pas de TVA ajoutée
(Charge tax false), expédition oui, vente impossible une fois le stock à zéro. Les produits arrivent en brouillon et
jamais publiés sur la boutique en ligne : Coline les passe en « actif » et les rend disponibles sur le seul canal
« Bouton d'achat » après les avoir relus. Les photos sont celles du site en ligne (Shopify les télécharge à l'import).

Usage : python3 tools/fabrique_import_shopify.py
Puis, dans Shopify : Produits > Importer.
"""
import csv, html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build

FICHE = os.path.join(ROOT, "DROP02-A-REMPLIR.md")
SORTIE = os.path.join(ROOT, "import-shopify-drop02.csv")
SITE = "https://www.boutiquetypique.fr"
VENDEUR = "Typique"
OPTION = "Taille"

# Colonnes du modèle d'import de Shopify (version 2025 : « URL handle », « Inventory quantity »...).
# Celles qu'on n'écrit pas gardent leur valeur par défaut. Les champs de la pièce ne sont remplis que sur sa première ligne.
COLONNES = [
    "Title", "URL handle", "Description", "Vendor", "Type", "Tags", "Published on online store", "Status",
    "Option1 name", "Option1 value", "Price", "Charge tax", "Inventory tracker", "Inventory quantity",
    "Continue selling when out of stock", "Requires shipping", "Fulfillment service",
    "Product image URL", "Image position", "Image alt text",
]


def stop(message):
    sys.exit("Erreur : " + message)


def slug(nom):
    """« L'Estaque » → « lestaque », « Corps Salé Coeur Solaire » → « corps-sale-coeur-solaire » (comme Shopify)."""
    return re.sub(r"[^a-z0-9]+", "-", build.sans_accent(nom).replace("'", "")).strip("-")


def js_chaine(brut):
    """Le texte d'une chaîne JavaScript, sans les antislashs (\\' devient ')."""
    return re.sub(r"\\(.)", r"\1", brut)


def lire_catalogue():
    """{nom sans accent: {nom, description, photos}} pour chaque pièce du tableau `catalogue` du .jsx."""
    src = open(build.JSX, encoding="utf-8").read()
    bloc = re.search(r"const catalogue = \[(.*?)\n  \];", src, re.S)
    if not bloc:
        stop("le tableau `catalogue` est introuvable dans typique-site.jsx.")
    chaine = r"""(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')"""
    pieces = {}
    for morceau in re.split(r"(?=\bid: ')", bloc.group(1))[1:]:
        nom = re.search(r"\bname: " + chaine, morceau)
        if not nom:
            continue
        nom = js_chaine(nom.group(1) or nom.group(2) or "")
        desc = re.search(r"\bdesc: " + chaine, morceau)
        desc = js_chaine(desc.group(1) or desc.group(2) or "") if desc else ""
        photos = re.search(r"\bphotos: \[([^\]]*)\]", morceau)
        fichiers = ["photos/%s.webp" % p.strip().lower() for p in photos.group(1).split(",") if p.strip()] if photos else []
        pieces[build.sans_accent(nom)] = {"nom": nom, "description": desc, "photos": fichiers}
    return pieces


def lire_fiche():
    """[{nom, type, prix, tailles, stock}] dans l'ordre de la fiche, avec un message clair pour tout ce qui manque."""
    if not os.path.exists(FICHE):
        stop("la fiche %s est introuvable." % os.path.basename(FICHE))
    texte = open(FICHE, encoding="utf-8").read()
    pieces = []
    for nom, corps in re.findall(r"^### \d+\. (.+?)[ \t]*\n(.*?)(?=^##|\Z)", texte, re.S | re.M):
        champs = dict(re.findall(r"^- (Type|Prix|Tailles|Stock) : (.+?)[ \t]*$", corps, re.M))
        for cle in ("Type", "Prix", "Tailles", "Stock"):
            if not champs.get(cle):
                stop("%s : la ligne « - %s : ... » manque dans la fiche." % (nom, cle))
        prix = re.fullmatch(r"(\d+(?:[.,]\d{1,2})?)\s*€", champs["Prix"])
        if not prix or float(prix.group(1).replace(",", ".")) <= 0:
            stop("%s : le prix « %s » est illisible (attendu : « 12 € » ou « 12,50 € »)." % (nom, champs["Prix"]))
        tailles = [t.strip() for t in champs["Tailles"].split(",")]
        if "" in tailles or len(set(tailles)) != len(tailles):
            stop("%s : la liste des tailles « %s » est mal écrite (une taille vide ou en double)." % (nom, champs["Tailles"]))
        stock = re.match(r"(\d+) par taille", champs["Stock"])
        if not stock or int(stock.group(1)) < 1:
            stop("%s : le stock « %s » est illisible (attendu : « 50 par taille »)." % (nom, champs["Stock"]))
        pieces.append({"nom": nom, "type": champs["Type"], "prix": "%.2f" % float(prix.group(1).replace(",", ".")),
                       "tailles": tailles, "stock": int(stock.group(1))})
    if not pieces:
        stop("aucune pièce trouvée dans la fiche (titres « ### 1. Nom de la pièce »).")
    return pieces


def lignes_produit(piece, site, tag):
    """Les lignes du CSV d'une pièce : une par taille ; la photo 1 sur la première ligne, la photo 2 sur la deuxième."""
    handle = slug(piece["nom"])
    legendes = ["face", "dos"]
    lignes = []
    for i, taille in enumerate(piece["tailles"]):
        ligne = {
            "URL handle": handle, "Option1 value": taille, "Price": piece["prix"],
            "Charge tax": "false", "Inventory tracker": "shopify", "Inventory quantity": piece["stock"],
            "Continue selling when out of stock": "deny", "Requires shipping": "true", "Fulfillment service": "manual",
        }
        if i == 0:
            ligne.update({
                "Title": piece["nom"], "Description": "<p>%s</p>" % html.escape(piece["description"], quote=False),
                "Vendor": VENDEUR, "Type": piece["type"], "Tags": tag,
                "Published on online store": "false", "Status": "draft", "Option1 name": OPTION,
            })
        if i < len(piece["photos"]):
            ligne.update({
                "Product image URL": "%s/%s" % (site, piece["photos"][i]), "Image position": i + 1,
                "Image alt text": "%s, %s" % (piece["nom"], legendes[i] if i < len(legendes) else "photo %d" % (i + 1)),
            })
        lignes.append(ligne)
    return lignes


def main():
    catalogue = lire_catalogue()
    fiche = lire_fiche()
    tag = build.lire_reglage(build.REGLAGE)["nom"]
    pieces = []
    for f in fiche:
        c = catalogue.get(build.sans_accent(f["nom"]))
        if not c:
            stop("%s est dans la fiche mais pas dans le tableau `catalogue` du site." % f["nom"])
        if not c["description"]:
            stop("%s : pas de description dans le site (champ `desc` vide dans typique-site.jsx)." % f["nom"])
        if len(c["photos"]) < 2:
            stop("%s : il faut deux photos (face et dos) dans le site, il y en a %d." % (f["nom"], len(c["photos"])))
        for p in c["photos"]:
            if not os.path.exists(os.path.join(ROOT, p)):
                stop("%s : le fichier %s n'existe pas." % (f["nom"], p))
        pieces.append({**f, "nom": c["nom"], "description": c["description"], "photos": c["photos"]})

    # Un texte pour les clientes : pas de tiret long ni moyen (règle de Coline).
    for p in pieces:
        for champ in ("nom", "description", "type"):
            if "—" in p[champ] or "–" in p[champ]:
                stop("%s : le champ « %s » contient un tiret long ou moyen." % (p["nom"], champ))
    handles = [slug(p["nom"]) for p in pieces]
    if len(set(handles)) != len(handles):
        stop("deux pièces ont la même adresse Shopify (URL handle).")

    with open(SORTIE, "w", encoding="utf-8", newline="") as sortie:
        ecrivain = csv.DictWriter(sortie, fieldnames=COLONNES, lineterminator="\n")
        ecrivain.writeheader()
        for p in pieces:
            ecrivain.writerows(lignes_produit(p, SITE, tag))

    # Relecture : on recompte ce qui vient d'être écrit.
    with open(SORTIE, encoding="utf-8", newline="") as relu:
        lignes = list(csv.DictReader(relu))
    produits = [l for l in lignes if l["Title"]]
    pieces_en_stock = sum(int(l["Inventory quantity"]) for l in lignes)
    attendu = sum(len(p["tailles"]) * p["stock"] for p in pieces)
    if len(produits) != len(pieces) or pieces_en_stock != attendu:
        stop("la relecture du fichier ne retombe pas sur les bons chiffres (produits %d, pièces %d)." % (len(produits), pieces_en_stock))

    print("Fichier écrit : %s" % os.path.relpath(SORTIE, ROOT))
    print("  %d produits en brouillon, %d variantes, %s pièces en stock en tout (étiquette « %s »)\n"
          % (len(produits), len(lignes), "{:,}".format(pieces_en_stock).replace(",", " "), tag))
    for p in pieces:
        print("  %-26s %-24s %6s €   %d tailles x %d   %s" % (p["nom"], p["type"], p["prix"].replace(".00", ""),
                                                             len(p["tailles"]), p["stock"], slug(p["nom"])))


if __name__ == "__main__":
    main()
