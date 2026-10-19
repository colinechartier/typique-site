# Handoff — Typique (site one-page)

## Overview

Maquette one-page pour **Typique**, marque française indépendante de surfwear oversize unisexe (Méditerranée ↔ Atlantique). Tagline : *entre sel et soleil*. Prononciation : `[tchipik]`.

Le site contient 8 sections : nav fixe, hero photo plein écran, définition dictionnaire (animée), bandeau catégories, 3 pièces phares, section "notre histoire" (image + texte), marquee lexique, formulaire de précommande, footer 3 colonnes.

## About the Design Files

Les fichiers livrés ici sont des **références de design** créées en HTML/JSX, pas du code de production à copier tel quel. Ils montrent le rendu visuel et les comportements attendus. La tâche est de **recréer ces designs dans le codebase cible** (ex : Next.js + Tailwind, Astro, Remix, …) en suivant les patterns existants. Si aucune codebase n'existe, choisir Next.js + Tailwind comme cible par défaut — c'est la stack pour laquelle le JSX a été écrit.

## Fidelity

**High-fidelity.** Couleurs, typo, espacements, animations et interactions sont finalisés. À recréer pixel-perfect.

## Files

- `index.html` — host standalone (Tailwind CDN + React UMD + Babel standalone) qui charge `typique-site.jsx`. Sert uniquement à prévisualiser le design hors codebase.
- `typique-site.jsx` — le composant React complet. **C'est le fichier de référence principal.** Utilise React 18, hooks, Tailwind, et lucide-react (remplacé ici par un shim d'icônes inline pour fonctionner en standalone — réintroduire `lucide-react` dans la codebase cible).
- `assets/wave-divider.png` — image PNG transparente de la vague décorative (extraite à la main d'une référence). Utilisée comme `mask-image` dans le composant `<WaveDivider />`.
- `BRIEF_FINITIONS_TYPIQUE.md` — brief original avec contexte de marque.

## Stack cible recommandée

- React 18 + Next.js (App Router) ou Vite
- Tailwind CSS (configuration des `:root` design tokens en CSS variables)
- `lucide-react` pour les icônes (le shim inline du fichier .jsx est temporaire)
- Aucune dépendance d'animation (tout est CSS keyframes + setTimeout chain)

## Design Tokens

Définis dans `<style>` global du composant, à porter dans `:root` ou `tailwind.config.js`.

| Token | Valeur | Usage |
|---|---|---|
| `--navy` | `#0F2865` | texte principal, fonds section histoire |
| `--navy-deep` | `#0A1F3D` | footer |
| `--cream` | `#F4F1EC` | fond principal, texte sur navy |
| `--sand` | `#D7CFC2` | accents fond |
| `--terracotta` | `#E39A7C` | accent CTA, italiques mises en avant |
| `--terracotta-deep` | `#C77D60` | hover btn terracotta |
| `--olive` | `#6B6F4A` | (réservé, non utilisé) |

### Typographies

```
font-typewriter   : 'Special Elite', 'Courier Prime', monospace
font-american-tw  : 'ITC American Typewriter', 'American Typewriter', 'Special Elite', monospace
font-serif-fine   : 'Cormorant', 'EB Garamond', serif
font-serif        : 'EB Garamond', Georgia, serif
```

Charger via Google Fonts : `Special Elite`, `EB Garamond` (400/500 + italic), `Cormorant` (400/500 + italic).

### Sélection / scrollbar

`::selection` : background `rgba(227,154,124,0.5)`, color `#0A1F3D`.

## Screens / Views

### 1. Nav fixe (top)
- `position: fixed`, transparente quand `scrollY < 60`, sinon fond `rgba(244,241,236,0.92)` + `backdrop-blur(8px)` + bordure basse 1px `rgba(15,40,101,0.08)`.
- Gauche : logo `typique` en `font-typewriter` 20-24px.
- Centre (md+) : `Boutique · Notre histoire · Précommande` en `font-american-tw` uppercase tracking 0.1em, avec underline animé `.link-under` (redraw left→right au hover).
- Droite : `Été 26 →` en terracotta quand transparente, navy quand scrolled.

### 2. Hero (plein écran)
- `h-screen min-h-[640px]`, photo de fond (constante `HERO_IMG`, base64 inline — coucher de soleil océanique) en `cover` position `center 65%`.
- Voile `rgba(15,40,101,0.32)` + dégradés sombres haut/bas + vignette radiale.
- Texture grain subtile via SVG noise (`.grain::after`).
- **Titre `typique`** : `font-typewriter`, `clamp(5rem, 18vw, 13rem)`, animation `title-rise` (1.8s, letter-spacing qui se resserre de 0.15em → 0).
- **Vague décorative** sous le titre : `<WaveDivider color="#F4F1EC" width={260} strokeWidth={1.2} />`.
- **Tagline** `entre sel et soleil` en `font-serif-fine` italic, letter-spacing 0.4em, lowercase.
- **Indicateur `Découvrir`** en bas (2.5rem du bas) :
  - Centré optiquement : wrapper avec `left-1/2 -translate-x-1/2`, le `<span>` interne porte `padding-left: 0.35em` pour compenser le `letter-spacing: 0.35em`.
  - Typo `font-american-tw`, sans italique, uppercase, `text-xs`, opacité 0.85.
  - Chevron 18px en dessous, animation `scroll-hint` (bounce 2.4s).

### 3. Définition dictionnaire (`<DefinitionSection />`)
Section animée déclenchée à l'`IntersectionObserver` (threshold 0.25, une seule fois).

**Chaîne d'étapes (state `step` 0→9)** :
1. Tape `typique` (95ms/char, `font-american-tw`, 3xl/5xl)
2. Tape `[tchipik]` (85ms/char)
3. Pause 400ms
4. Tape `Qui caractérise sans qu'on sache l'expliquer.` (28ms/char, `font-serif`)
5. Pause 300ms
6. Tape `Vêtements oversize, pensés pour celles et ceux qui vivent ` (26ms/char)
7. Tape `entre sel et soleil` (42ms/char) — **terracotta italique**
8. Tape ` — un pied dans l'Atlantique, l'autre dans la Méditerranée.` (26ms/char)
9. Terminé — curseur disparaît

**Curseur** : `|` en `inline-block`, animation `tw-blink` (steps(2, start), 900ms), suit la frappe en cours.

**a11y** : `prefers-reduced-motion: reduce` court-circuite l'animation (tout s'affiche directement). Texte complet en `.sr-only` pour les lecteurs d'écran.

Composant `<Typewriter text start speed onDone showCursor instant />` réutilisable, plus hook `usePrefersReducedMotion()`.

Numéro romain `I.` en haut + vague en bas (`<WaveDivider color="#0F2865" width={140} />`) — pas tapés à la machine.

### 4. Bandeau catégories
Fond navy `#0F2865`, texture grain, 3 liens uppercase tracking 0.35em séparés par `·` terracotta. Hover → terracotta.

### 5. Pièces phares (3 cards)
- Titre : eyebrow `II. PIÈCES PHARES` (terracotta typewriter 0.4em), titre `font-serif-fine` italic, sous-titre `font-serif`.
- Grid `md:grid-cols-3 gap-8`, chaque card :
  - `aspect-square` background sable, mockup SVG produit, ref produit en haut-gauche (typewriter 10px, opacité 0.5).
  - Body padding 7-8 : catégorie italic uppercase tracking 0.3em → nom (typewriter 2xl) → description (serif) → prix + CTA "Précommander →" (terracotta).
- Hover card : `translateY(-6px)` + shadow plus marquée, flèche CTA glisse de 4px à droite. Transitions 600ms `cubic-bezier(.2,.6,.2,1)`.

Mockups SVG : `<TshirtMockup>`, `<HoodieMockup>`, `<BobMockup>`. Voir le code pour les détails (props colorables).

### 6. Section "Notre histoire"
Fond navy, grid 2 colonnes lg.
- Gauche : `<CabaneTchanqueeScene />` — illustration SVG plein cadre (cabane tchanquée + coucher de soleil + reflets dans l'eau). Légende polaroid en bas-gauche : `BASSIN D'ARCACHON · ÉTÉ 25` typewriter 10-12px tracking 0.2em, fond `rgba(244,241,236,0.92)`.
- Droite : eyebrow `III. NOTRE HISTOIRE`, titre `Une histoire de pont.` (serif-fine italic), 2 paragraphes serif, CTA `Découvrir notre histoire ↗`, line + `Marseille — Cap Ferret`.

### 7. Marquee lexique
Hauteur ~`py-8`, fond cream avec bordures top/bottom 1px navy 8% alpha. Mots : `garrigue · baïne · mistral · tchanquée · restanque · cachotte · farigoule · la leyre`. Animation `marquee` 60s linear infinite. Tous les 4 mots : terracotta opacité 0.9, sinon navy opacité 0.55. `font-serif-fine` italic 2xl/3xl.

### 8. Précommandes
Eyebrow `IV. PRÉCOMMANDES`, titre 2 lignes (`La première collection / arrive.`), description, vague navy width 120, label `Précommande ouverte`, formulaire email + bouton terracotta. État `submitted` → carte de confirmation terracotta.
Bouton `.btn-terra` : fond terracotta cream sur cream-text, hover `translateY(-1px)` + terracotta-deep.

### 9. Footer
Fond `#0A1F3D`, 3 colonnes :
1. Logo + tagline + lexique en terracotta italic
2. Nav (Boutique, Notre histoire, Précommander, Mentions légales)
3. Suivre (Instagram, Mail) + bloc "Marque française indépendante…"

Trait de séparation, copyright + `[tchipik], à la provençale.`

## Composants réutilisables

| Composant | Rôle |
|---|---|
| `Reveal` | Fade-in + translateY au scroll (1100ms ease, IntersectionObserver, declenche une fois) |
| `WaveDivider` | Vague décorative — utilise `assets/wave-divider.png` comme `mask-image`, recolorée via `background-color`. Props : `color`, `width`, `strokeWidth` (legacy, non utilisé). |
| `Typewriter` | Frappe lettre par lettre. Props : `text`, `start`, `speed`, `onDone`, `showCursor`, `instant`. |
| `useInView(options)` | Hook IntersectionObserver one-shot. |
| `usePrefersReducedMotion()` | Hook media query `(prefers-reduced-motion: reduce)`. |
| `HeroScene` | Photo + voile + dégradés du hero. |
| `CabaneTchanqueeScene` | SVG illustration section histoire. |
| `TshirtMockup`, `HoodieMockup`, `BobMockup` | Mockups SVG produits. |

## Animations & Behavior

| Nom | Élément | Durée | Easing |
|---|---|---|---|
| `title-rise` | Hero h1, tagline, vague | 1400-1800ms | `cubic-bezier(.2,.6,.2,1)` |
| `bounce-subtle` | Indicateur Découvrir | 2.4s ease-in-out infinite | — |
| `marquee` | Bandeau lexique | 60s linear infinite | — |
| `tw-blink` | Curseur typewriter | 900ms steps(2, start) infinite | — |
| `underline-redraw` | Liens `.link-under` au hover | 700ms | `cubic-bezier(.2,.6,.2,1)` |
| Reveal | Tous les `<Reveal>` | 1100ms | `cubic-bezier(.2,.6,.2,1)` |
| Card hover | `.product-card` | 600ms | `cubic-bezier(.2,.6,.2,1)` |
| `prefers-reduced-motion` | Global | court-circuite tout (`0.01ms`) | — |

## State Management

Composant racine `TypiqueSite` :
- `email`, `submitted` — formulaire précommande
- `scrolled` — bool `window.scrollY > 60` pour la nav

Composant `DefinitionSection` :
- `step` — entier 0→9 orchestrant la chaîne typewriter
- `sectionRef` — déclencheur IntersectionObserver

**Aucun appel réseau ni persistance.** Le formulaire de précommande est purement local (à brancher côté codebase cible — Mailchimp, Klaviyo, API maison).

## Assets

- `HERO_IMG` (constante base64 dans `typique-site.jsx`) : photo coucher de soleil océanique. Garder telle quelle ou remplacer par un asset hébergé.
- `assets/wave-divider.png` : vague hand-drawn extraite d'une référence, fond transparent, cream `#F4F1EC`. Utilisée via CSS mask pour pouvoir la recolorer.
- Aucune autre image — toutes les illustrations produit + cabane sont en SVG inline.

## Notes d'implémentation

1. **Réintroduire `lucide-react`** : remplacer le shim `Icon`/`ChevronDown`/etc. par `import { ChevronDown, Instagram, Mail, ArrowRight, ArrowUpRight } from 'lucide-react'`.
2. **Tokens CSS** : porter le bloc `:root { --navy: … }` dans la feuille globale ou `tailwind.config.js`.
3. **Polices** : ajouter Google Fonts dans `<head>` ou via `next/font`.
4. **Image hero** : extraire la base64 vers un fichier `public/hero.jpg` pour réduire la taille du bundle.
5. **Vague** : `assets/wave-divider.png` doit être servie depuis `/public` (Next) ou équivalent.
6. **Pas de localStorage / sessionStorage** (contrainte explicite du brief).
7. **Étape suivante prévue** (hors scope ici) : retravailler la section "Pièces phares" avec de vraies photos produit en remplacement des mockups SVG.
