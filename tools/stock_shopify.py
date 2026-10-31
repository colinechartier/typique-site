"""Stock réel des pièces en vente, lu dans Shopify sans rien acheter : un panier jetable demande 999 exemplaires
de chaque taille et Shopify ramène chaque ligne à la quantité disponible. Donne aussi le prix de Shopify, celui que le site affiche.
Le jeton public du site sert à la lecture ; il n'est jamais affiché.   Usage : python3 tools/stock_shopify.py
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "2026-01"
src = open(os.path.join(ROOT, "design_handoff_typique_site", "typique-site.jsx"), encoding="utf-8").read()
token = re.search(r"SHOPIFY_TOKEN\s*=\s*'([^']+)'", src).group(1)
domain = re.search(r"SHOPIFY_DOMAIN\s*=\s*'([^']+)'", src).group(1)
# Les identifiants Shopify viennent du fichier de réglage (reglage-drop.ini), lu et vérifié comme à la construction du site.
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build
reglage = build.lire_reglage(build.REGLAGE)
ids = {ident: sid for ident, _, sid in reglage["nouvelles"] + reglage["anciennes"] if sid}
noms = dict(build.catalogue_jsx())


def gql(query, variables=None):
    req = urllib.request.Request(f"https://{domain}/api/{API}/graphql.json",
                                 data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                                 headers={"Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


prods = gql("""query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title
  variants(first: 30) { nodes { id title availableForSale currentlyNotInStock price { amount } } } } } }""",
            {"ids": [f"gid://shopify/Product/{n}" for n in ids.values()]})["data"]["nodes"]
variants = [v for p in prods if p for v in p["variants"]["nodes"]]
cc = gql("""mutation($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) {
  cart { lines(first: 250) { nodes { quantity merchandise { ... on ProductVariant { id } } } } } userErrors { message } } }""",
         {"lines": [{"merchandiseId": v["id"], "quantity": 999} for v in variants]})["data"]["cartCreate"]
for e in cc["userErrors"]:
    print("Erreur Shopify :", e["message"])
qty = {l["merchandise"]["id"]: l["quantity"] for l in cc["cart"]["lines"]["nodes"]} if cc["cart"] else {}

num2site = {v: k for k, v in ids.items()}
for numid, p in zip(ids.values(), prods):
    if p is None:
        print(f"{num2site[numid]} : introuvable dans Shopify (pièce non publiée sur le canal Buy Button ?)")
        continue
    nom = noms.get(num2site[numid], "?")
    cases = []
    for v in p["variants"]["nodes"]:
        q = qty.get(v["id"], 0)
        etat = ("999 ou plus, ou stock non suivi" if q == 999 else str(q)) if v["availableForSale"] else "ÉPUISÉ"
        if v["currentlyNotInStock"]:
            etat += " (rupture, vente quand même)"
        cases.append(f"{'TU' if v['title'] == 'Default Title' else v['title']} {etat}")
    prix = sorted({float(v["price"]["amount"]) for v in p["variants"]["nodes"]})
    prix_txt = f"{prix[0]:g} à {prix[-1]:g} €" if len(prix) > 1 else f"{prix[0]:g} €"
    print(f"{nom} ({prix_txt}) : " + " · ".join(cases))
