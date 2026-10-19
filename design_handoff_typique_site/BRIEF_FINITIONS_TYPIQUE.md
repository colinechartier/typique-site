# Brief — Finitions maquette site Typique

## Contexte rapide

Maquette one-page React/Tailwind pour **Typique** — marque française indépendante de surfwear oversize unisexe, qui fait le pont entre la Méditerranée (Bouches-du-Rhône) et l'Atlantique (Cap Ferret, Bassin d'Arcachon, Hossegor).

- **Tagline** : entre sel et soleil
- **Prononciation** : [tchipik], à la provençale
- **Inspirations** : *Les Petits Mouchoirs* (Canet, 2010), golden hour Cap Ferret, ambiance carnet de voyage entre potes
- **Palette** : navy `#0F2865` · navy deep `#0A1F3D` · crème `#F4F1EC` · sable `#D7CFC2` · terracotta `#E39A7C` · kaki `#6B6F4A`
- **Typos** : Special Elite (Google Fonts, fallback) + ITC American Typewriter (système macOS/iOS) pour les mots-clés de marque · Cormorant + EB Garamond pour les serifs
- **Format de sortie** : un seul artifact React `.jsx`, single-file, Tailwind, pas de `localStorage`/`sessionStorage`

## État actuel du fichier `typique-site.jsx`

Le fichier joint est complet et fonctionnel. Voici ce qui est **déjà en place** et qu'il ne faut **PAS modifier** :

- Structure complète : nav fixe, hero, définition dictionnaire, bandeau catégories, 3 pièces phares (Le Ferret, La Tchanquée, Le Pilat), section "entre sel et soleil" avec illustration cabane tchanquée SVG, marquee lexique, précommandes, footer 3 colonnes
- **Hero** : photo réelle de coucher de soleil océanique en background (embarquée en base64 dans la constante `HERO_IMG`), voile navy 32 %, vignette douce. **NE PAS toucher à la photo ni à la composition du hero.**
- **Vague décorative** (`<WaveDivider />`) : reproduite à partir du logo Typique officiel (asymétrique : creux léger à gauche, crête au 2/3 droit, queue effilée à droite). **NE PAS la modifier.**
- **Nav du haut** ("Boutique · Notre histoire · Précommande") : utilise déjà la classe `.font-american-tw` (American Typewriter). **OK comme ça.**
- **Animations existantes** : titre "typique" du hero qui apparaît avec un letter-spacing qui se resserre (`hero-title`), reveals au scroll via `IntersectionObserver`, marquee lexique, hover cards produits.
- **Mockups produits SVG** : Le Ferret (t-shirt gris bubble letters), La Tchanquée (hoodie crème triple TYPIQUE), Le Pilat (bob noir washed). On y reviendra plus tard.

---

## TÂCHES À RÉALISER (dans cet ordre)

### 1. Centrage et typo de l'indicateur "Découvrir" du hero

Le petit lien `Découvrir` + chevron en bas du hero est actuellement **mal centré horizontalement** (probablement à cause du `letter-spacing` qui décale visuellement le texte vers la droite) et utilise la mauvaise typo.

**À faire** :
- Centrage **optique** parfait du bloc (pas juste mathématique). Le `letter-spacing: 0.35em` crée un décalage visuel à droite — il faut compenser avec un `padding-left` équivalent à environ la moitié du letter-spacing, OU recentrer le `<a>` lui-même via flex parent.
- Remplacer la classe `font-serif-fine italic` du `<span>` par `font-american-tw` (sans italique).
- Garder : `text-xs`, `tracking-[0.35em]`, `uppercase`, opacité ~0.85, le chevron en dessous, l'animation `scroll-hint`.

Code actuel à modifier (dans la section Hero) :
```jsx
<a
  href="#definition"
  className="scroll-hint absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
  style={{ bottom: '2.5rem', color: '#F4F1EC' }}
  aria-label="Faire défiler"
>
  <span
    className="font-serif-fine italic text-xs tracking-widest uppercase"
    style={{ letterSpacing: '0.3em', opacity: 0.7 }}
  >
    Découvrir
  </span>
  <ChevronDown size={18} strokeWidth={1.2} />
</a>
```

### 2. Animation machine à écrire sur la section "Définition dictionnaire" (page 2)

C'est la section juste après le hero, fond crème, avec l'entrée de dictionnaire :
> **typique** [tchipik]
> *adj.* Qui caractérise sans qu'on sache l'expliquer.
> *n.f.* Vêtements oversize, pensés pour celles et ceux qui vivent **entre sel et soleil** — un pied dans l'Atlantique, l'autre dans la Méditerranée.

**Comportement attendu** :
1. Le bloc démarre **vide** quand la section entre dans le viewport (à détecter via `IntersectionObserver`, comme le composant `Reveal` existant le fait déjà — tu peux t'en inspirer).
2. **Étape 1** : le mot `typique` se tape lettre par lettre (vitesse ~80-100ms/caractère) en typo `font-american-tw` (ou `font-typewriter` si plus fidèle au logo manuscrit).
3. **Étape 2** : juste après, la phonétique `[tchipik]` se tape lettre par lettre à côté.
4. Petite pause (~400ms).
5. **Étape 3** : la première définition se tape entièrement (`adj.` Qui caractérise sans qu'on sache l'expliquer.).
6. Petite pause (~300ms).
7. **Étape 4** : la seconde définition se tape entièrement (`n.f.` Vêtements oversize…). L'expression `entre sel et soleil` doit rester **terracotta italique** une fois tapée.
8. Une fois l'animation terminée, **tout reste statique** (pas de boucle, pas de curseur clignotant qui persiste).
9. Pendant la frappe : un curseur fin `|` clignote à la fin du texte en cours de frappe (style machine à écrire). Le curseur disparaît une fois toute l'animation terminée.
10. Animation déclenchée **une seule fois** à la première entrée dans le viewport — si l'utilisateur scroll-up puis re-scroll-down, on ne rejoue pas.
11. Respecter `prefers-reduced-motion` : si activé, tout s'affiche directement sans animation.

**Implémentation suggérée** :
- Un composant `<Typewriter text={...} delay={...} onDone={...} speed={80} />` réutilisable, qui se déclenche quand sa prop `start` passe à `true`.
- Une chaîne de `useState` pour orchestrer les étapes : `step` qui passe de 0 à 4, chaque `Typewriter` reçoit `start={step >= N}` et appelle `onDone={() => setStep(s => s + 1)}` à la fin.
- `IntersectionObserver` sur la section pour démarrer la chaîne (mettre `step` à 1 quand `inView`).

**Soin du détail** :
- La structure HTML existante de la section doit être **conservée** (mêmes classes, mêmes balises sémantiques) — on remplace juste le contenu textuel par les composants `<Typewriter />`.
- Le numéro romain "I." en haut de section et la vague en bas doivent apparaître normalement (pas tapés à la machine).

---

## CE QU'IL NE FAUT PAS FAIRE

- Ne pas changer la photo du hero ni sa composition
- Ne pas changer la vague (`WaveDivider`)
- Ne pas toucher aux 3 pièces phares (mockups, prix, descriptions) — étape suivante
- Ne pas casser les animations existantes (`Reveal`, marquee, hover cards)
- Ne pas ajouter de nouvelle dépendance npm (rester sur React + lucide-react)
- Ne pas utiliser `localStorage` ou `sessionStorage`

## Étape d'après (pour info, à ne pas traiter ici)

Une fois ces deux finitions validées, on retravaillera la section **Pièces phares** (les 3 vêtements) — probablement avec de vraies photos produit en remplacement des mockups SVG actuels, et possiblement une présentation un peu différente. Mais **pas dans cette itération**.

---

**Génère le fichier `.jsx` mis à jour avec ces deux modifications, sans rien casser d'autre.**
