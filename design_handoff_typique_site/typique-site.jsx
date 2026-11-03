const { useState, useEffect, useRef } = React;

// ============================================================
// SHOPIFY — intégration Buy SDK
// ============================================================
const SHOPIFY_DOMAIN = 'idkwvs-tc.myshopify.com';
const SHOPIFY_TOKEN  = '76444f16fa7cea3e4d681c0f6e8a3189';

// Identifiants des pièces en vente : lus dans reglage-drop.ini par tools/build.py (variable DROP_REGLAGE, placée en tête de app.js).
// Une pièce sans identifiant n'a jamais de bouton d'achat actif.
const SHOPIFY_IDS = DROP_REGLAGE.shopifyIds;

// Le SDK n'est chargé qu'à l'ajout au panier : il ne ralentit plus l'ouverture du site.
// Copie figée de la version « latest » de Shopify (4.0.4, testée jusqu'à la page de paiement le 31/10/2026) :
// une mise à jour chez Shopify ne change rien pendant un drop. Pour la changer : nouveau fichier, nouveau nom.
const SHOPIFY_SDK_URL = '/vendor/buy-button-storefront-4.0.4.min.js';
let _sdkPromise = null;
function loadShopifySdk() {
  if (window.ShopifyBuy) return Promise.resolve();
  if (!_sdkPromise) {
    _sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHOPIFY_SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { _sdkPromise = null; reject(new Error('SDK Shopify indisponible')); };
      document.head.appendChild(s);
    });
  }
  return _sdkPromise;
}

let _shopifyClient = null;
function getShopifyClient() {
  if (!_shopifyClient && window.ShopifyBuy) {
    _shopifyClient = ShopifyBuy.buildClient({
      domain: SHOPIFY_DOMAIN,
      storefrontAccessToken: SHOPIFY_TOKEN,
    });
  }
  return _shopifyClient;
}

// Le site affiche « XXL », Shopify nomme la variante « 2XL ».
const SIZE_ALIASES = { XXL: '2XL' };

// Ne jamais retomber sur une autre taille : mieux vaut une erreur qu'une commande en XS.
function findVariant(product, sizeName) {
  if (product.variants.length === 1) return product.variants[0];
  const variant = product.variants.find(v => v.title === sizeName || v.title === SIZE_ALIASES[sizeName]);
  if (!variant) throw new Error(`taille ${sizeName} introuvable pour ${product.title}`);
  return variant;
}

async function buyWithShopify(productNumId, sizeName) {
  await loadShopifySdk();
  const client = getShopifyClient();
  if (!client) { alert("Erreur : SDK Shopify non chargé."); return; }
  const gid = `gid://shopify/Product/${productNumId}`;
  const product = await client.product.fetch(gid);
  const variant = findVariant(product, sizeName);
  const checkout = await client.checkout.create({
    lineItems: [{ variantId: variant.id, quantity: 1 }]
  });
  const returnUrl = 'https://www.boutiquetypique.fr';
  const checkoutUrl = new URL(checkout.webUrl);
  checkoutUrl.searchParams.set('return_to', returnUrl);
  window.location.href = checkoutUrl.toString();
}

async function checkoutCartItems(cartItems) {
  try {
    await loadShopifySdk();
    const client = getShopifyClient();
    if (!client) { alert("Erreur : SDK Shopify non chargé."); return; }
    const lineItems = [];
    for (const item of cartItems) {
      const productNumId = SHOPIFY_IDS[item.product.id];
      if (!productNumId) continue;
      const gid = `gid://shopify/Product/${productNumId}`;
      const product = await client.product.fetch(gid);
      const variant = findVariant(product, item.size);
      lineItems.push({ variantId: variant.id, quantity: item.qty });
    }
    const checkout = await client.checkout.create({ lineItems });
    const returnUrl = 'https://www.boutiquetypique.fr';
    const checkoutUrl = new URL(checkout.webUrl);
    checkoutUrl.searchParams.set('return_to', returnUrl);
    window.location.href = checkoutUrl.toString();
  } catch (e) {
    alert(`Impossible d'ouvrir le paiement (${e.message}). Réessaie dans un instant ou écris-nous.`);
  }
}

// ============================================================
// PRIX ET STOCK — lus dans Shopify, une seule requête pour toutes les pièces
// ============================================================
// Rien n'est recopié dans le site : le prix et la disponibilité de chaque taille viennent de Shopify (jeton public, lecture seule).
// Ce jeton ne lit pas les quantités, seulement « disponible » ou « épuisé » : cela suffit pour griser une taille.
const SHOPIFY_API_VERSION = '2026-07';
const STOCK_QUERY = 'query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id variants(first: 50) { nodes { title availableForSale price { amount currencyCode } } } } } }';

// Le site affiche « XXL » et « Taille unique », Shopify nomme ces variantes « 2XL » et « Default Title ».
const TAILLE_AFFICHEE = { '2XL': 'XXL', 'Default Title': 'Taille unique' };

// 44 → « 44 », 44.5 → « 44,50 »
function eurosFr(n) {
  const cents = Math.round(n * 100);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

// { identifiant Shopify de la pièce: [{ label, dispo, priceNum, prix }, ...] } dans l'ordre des tailles de Shopify.
// Une pièce que Shopify ne renvoie pas (inconnue ou non publiée sur le canal Buy Button) est absente du résultat.
async function lireStockShopify(ids) {
  const ctrl = new AbortController();
  const delai = setTimeout(() => ctrl.abort(), 6000);
  try {
    const rep = await fetch(`https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN },
      body: JSON.stringify({ query: STOCK_QUERY, variables: { ids: ids.map(n => `gid://shopify/Product/${n}`) } })
    });
    if (!rep.ok) throw new Error(`Shopify a répondu ${rep.status}`);
    const json = await rep.json();
    if (json.errors || !json.data || !Array.isArray(json.data.nodes)) throw new Error('réponse Shopify inattendue');
    const pieces = {};
    for (const n of json.data.nodes) {
      if (!n || !n.variants.nodes.length) continue;
      pieces[n.id.split('/').pop()] = n.variants.nodes.map(v => {
        const montant = Number(v.price.amount);
        // Jamais de prix inventé : un prix illisible ou dans une autre devise fait échouer toute la lecture.
        if (!(montant > 0) || v.price.currencyCode !== 'EUR') throw new Error('prix Shopify illisible');
        return { label: TAILLE_AFFICHEE[v.title] || v.title, dispo: v.availableForSale, priceNum: montant, prix: `${eurosFr(montant)} €` };
      });
    }
    return pieces;
  } finally {
    clearTimeout(delai);
  }
}

// Lecture partagée : deux demandes en même temps n'envoient qu'une requête. Deux essais, puis l'échec est rendu.
let _stockEnCours = null;
let _stockPrecedent = null; // dernière lecture réussie : { pieces, heure }
function lireStock() {
  if (!_stockEnCours) {
    const ids = Object.values(SHOPIFY_IDS);
    _stockEnCours = (async () => {
      if (!ids.length) return {};
      for (let essai = 1; ; essai++) {
        try { return await lireStockShopify(ids); }
        catch (e) {
          if (essai === 2) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    })()
      .then(pieces => { _stockPrecedent = { pieces, heure: Date.now() }; return pieces; })
      .finally(() => { _stockEnCours = null; });
  }
  return _stockEnCours;
}
// Lancée dès le chargement du fichier (l'accueil le charge 90 s avant l'ouverture) : les prix sont là quand la boutique s'affiche.
if (Object.keys(SHOPIFY_IDS).length) lireStock().catch(() => {});

// La taille choisie par le client si elle est encore disponible, sinon la première qui l'est.
function tailleChoisie(p, voulue) {
  const t = p.sizes.find(s => s.label === voulue && s.dispo) || p.sizes.find(s => s.dispo);
  return t ? t.label : null;
}

// Ce que fait le bouton d'achat d'une pièce : 'ouvert', 'bientot', 'chargement' ou 'indisponible'.
function etatAchat(p, dropStatus, taille) {
  if (dropStatus !== 'active' || p.stockEtat === 'aucun') return 'bientot';
  if (p.stockEtat === 'chargement') return 'chargement';
  return p.stockEtat === 'ok' && taille ? 'ouvert' : 'indisponible';
}

// La taille d'une ligne de panier telle que Shopify la décrit.
const tailleShopify = (pieces, item) => (pieces[SHOPIFY_IDS[item.product.id]] || []).find(s => s.label === item.size);

// ---------- Icônes inline (remplace lucide-react en mode standalone) ----------
const Icon = ({ children, size = 24, strokeWidth = 1.5, className = '', style = {} }) =>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth={strokeWidth}
  strokeLinecap="round"
  strokeLinejoin="round"
  className={className}
  style={style}
  aria-hidden="true">
  
    {children}
  </svg>;

const ChevronDown = (p) => <Icon {...p}><polyline points="6 9 12 15 18 9" /></Icon>;
const ArrowRight = (p) => <Icon {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Icon>;
const ArrowUpRight = (p) => <Icon {...p}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></Icon>;
const Mail = (p) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2 6 12 13 22 6" /></Icon>;
const Instagram = (p) =>
<Icon {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </Icon>;




// ---------- Custom hook : apparition au scroll ----------
function useInView(options = { threshold: 0.15 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, options);
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

// ---------- Hook : prefers-reduced-motion ----------
function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefers(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener('change', update) : mq.addListener(update);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', update) : mq.removeListener(update);
    };
  }, []);
  return prefers;
}

// ---------- Composant Typewriter ----------
// Tape `text` lettre par lettre quand `start` passe à true. Appelle onDone à la fin.
// Affiche un curseur clignotant tant que `showCursor` est true.
function Typewriter({ text, start, speed = 85, onDone, showCursor = false, instant = false }) {
  const [count, setCount] = useState(instant ? text.length : 0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (instant) {
      setCount(text.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone && onDone();
      }
      return;
    }
    if (!start) return;
    if (count >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone && onDone();
      }
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), speed);
    return () => clearTimeout(t);
  }, [start, count, text, speed, onDone, instant]);

  return (
    <>
      {text.slice(0, count)}
      {showCursor &&
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.5ch',
          marginLeft: '0.05em',
          animation: 'tw-blink 900ms steps(2, start) infinite',
          color: 'currentColor',
          opacity: 0.85
        }}>
        
          |
        </span>
      }
    </>);

}

// ---------- Composant Reveal ----------
function Reveal({ children, delay = 0, className = '' }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 1100ms cubic-bezier(.2,.6,.2,1) ${delay}ms, transform 1100ms cubic-bezier(.2,.6,.2,1) ${delay}ms`
      }}>
      
      {children}
    </div>);

}

// ---------- Compte à rebours ----------
// Heure de confiance du site : celle du serveur (horloge.js, copiée dans la page par tools/build.py).
// L'heure de l'appareil seulement si l'horloge est absente.
const maintenant = () => (window.HORLOGE ? window.HORLOGE.maintenant() : Date.now());

// Isolé dans son propre composant : seul lui se redessine chaque seconde, pas tout le site.
function CountdownDigits({ target, color, onExpire }) {
  const calc = () => {
    const diff = target - maintenant();
    if (diff <= 0) return null;
    return {
      j: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  const [timeLeft, setTimeLeft] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => {
      const next = calc();
      setTimeLeft(next);
      if (!next) {
        clearInterval(t);
        if (onExpire) onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [target.getTime()]);
  const left = timeLeft || {};
  return (
    <div className="flex gap-4">
      {[['j', 'jours'], ['h', 'heures'], ['m', 'min'], ['s', 'sec']].map(([k, label]) => (
        <div key={k} className="text-center">
          <p className="font-typewriter text-2xl md:text-3xl" style={{ color }}>{String(left[k] ?? 0).padStart(2, '0')}</p>
          <p className="font-typewriter text-[9px] tracking-[0.2em] uppercase" style={{ opacity: 0.45 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- Vague décorative (image hand-drawn) ----------
// Utilise vague-ref.png en cream sur fond transparent, recolorée via mask pour suivre la prop `color`
function WaveDivider({ color = '#F4F1EC', width = 220, strokeWidth = 1.4 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: width,
        height: Math.round(width * 0.135), // ratio 744:113 ≈ 0.152, légèrement réduit
        backgroundColor: color,
        WebkitMaskImage: `url(${WAVE_DIVIDER})`,
        maskImage: `url(${WAVE_DIVIDER})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

// ---------- Mockups produits SVG ----------

// T-shirt avec bubble letters TYPIQUE au dos
function TshirtMockup({ bodyColor = '#3A3A3A', letterColor = '#F4F1EC', letterStroke = '#E39A7C' }) {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-full">
      {/* T-shirt body, vu de dos, oversize */}
      <path
        d="M55 75 L95 55 L110 60 Q150 50 190 60 L205 55 L245 75 L235 130 L210 122 L210 260 L90 260 L90 122 L65 130 Z"
        fill={bodyColor} />
      
      {/* Encolure dos */}
      <path
        d="M115 60 Q150 75 185 60"
        stroke={bodyColor}
        strokeWidth="2"
        fill="none"
        opacity="0.5" />
      
      {/* Plis subtils */}
      <path d="M105 130 Q110 180 105 230" stroke="rgba(0,0,0,0.15)" strokeWidth="1" fill="none" />
      <path d="M195 130 Q190 180 195 230" stroke="rgba(0,0,0,0.15)" strokeWidth="1" fill="none" />
      {/* Bubble letters TYPIQUE au dos */}
      <g transform="translate(150 195)" textAnchor="middle">
        <text
          fontFamily="'Special Elite', monospace"
          fontWeight="700"
          fontSize="34"
          fill={letterColor}
          stroke={letterStroke}
          strokeWidth="1.2"
          letterSpacing="2"
          style={{ paintOrder: 'stroke fill' }}>
          
          TYPIQUE
        </text>
      </g>
    </svg>);

}

// Hoodie crème avec triple TYPIQUE bubble letters
function HoodieMockup({ bodyColor = '#F4F1EC', letterColor = '#0F2865' }) {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-full">
      {/* Capuche arrière */}
      <path
        d="M115 50 Q150 30 185 50 L195 75 Q150 65 105 75 Z"
        fill={bodyColor}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="1" />
      
      {/* Corps hoodie */}
      <path
        d="M50 90 L100 70 L105 75 Q150 65 195 75 L200 70 L250 90 L240 145 L215 138 L215 270 L85 270 L85 138 L60 145 Z"
        fill={bodyColor}
        stroke="rgba(0,0,0,0.06)"
        strokeWidth="1" />
      
      {/* Manches et plis */}
      <path d="M85 145 Q90 200 85 270" stroke="rgba(0,0,0,0.1)" strokeWidth="1" fill="none" />
      <path d="M215 145 Q210 200 215 270" stroke="rgba(0,0,0,0.1)" strokeWidth="1" fill="none" />
      {/* Cordons capuche */}
      <line x1="140" y1="68" x2="138" y2="92" stroke="#0F2865" strokeWidth="1.5" opacity="0.4" />
      <line x1="160" y1="68" x2="162" y2="92" stroke="#0F2865" strokeWidth="1.5" opacity="0.4" />
      {/* Triple TYPIQUE x3 */}
      <g textAnchor="middle" fontFamily="'Special Elite', monospace" fontWeight="700" letterSpacing="1.5">
        <text x="150" y="170" fontSize="22" fill={letterColor}>TYPIQUE</text>
        <text x="150" y="200" fontSize="22" fill={letterColor}>TYPIQUE</text>
        <text x="150" y="230" fontSize="22" fill={letterColor}>TYPIQUE</text>
      </g>
      {/* Ourlet bas */}
      <line x1="85" y1="262" x2="215" y2="262" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
    </svg>);

}

// Bob washed avec étiquette tissée
function BobMockup({ bodyColor = '#1F1F1F', labelColor = '#F4F1EC', labelText = '#E39A7C' }) {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-full">
      {/* Bord du bob */}
      <ellipse cx="150" cy="200" rx="120" ry="22" fill={bodyColor} />
      <ellipse cx="150" cy="195" rx="120" ry="22" fill="rgba(255,255,255,0.06)" />
      {/* Couronne */}
      <path
        d="M55 198 Q55 110 150 100 Q245 110 245 198"
        fill={bodyColor} />
      
      {/* Texture washed - taches lumineuses */}
      <ellipse cx="100" cy="140" rx="35" ry="15" fill="rgba(255,255,255,0.04)" />
      <ellipse cx="190" cy="160" rx="40" ry="18" fill="rgba(255,255,255,0.05)" />
      <ellipse cx="150" cy="120" rx="50" ry="10" fill="rgba(255,255,255,0.06)" />
      {/* Couture du bord */}
      <path d="M55 195 Q150 188 245 195" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" strokeDasharray="3 4" />
      {/* Étiquette tissée */}
      <rect x="123" y="142" width="54" height="22" rx="2" fill={labelColor} />
      <text
        x="150"
        y="158"
        textAnchor="middle"
        fontFamily="'Special Elite', monospace"
        fontSize="14"
        fill={labelText}>
        
        typique
      </text>
    </svg>);

}

function CasquetteMockup({ bodyColor = '#6B6F4A', labelColor = '#F4F1EC' }) {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-full">
      <path d="M78 192 Q150 204 258 186 L254 200 Q150 218 73 206 Z" fill={bodyColor} stroke="rgba(0,0,0,0.18)" strokeWidth="1"/>
      <path d="M83 194 Q150 206 253 189" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" fill="none" strokeDasharray="4 3"/>
      <path d="M98 192 Q76 138 108 97 Q150 72 192 97 Q224 138 202 192" fill={bodyColor}/>
      <path d="M150 83 L150 192" stroke="rgba(0,0,0,0.1)" strokeWidth="0.8" fill="none"/>
      <path d="M108 97 Q128 142 128 192" stroke="rgba(0,0,0,0.1)" strokeWidth="0.8" fill="none"/>
      <path d="M192 97 Q172 142 172 192" stroke="rgba(0,0,0,0.1)" strokeWidth="0.8" fill="none"/>
      <circle cx="150" cy="84" r="7" fill={bodyColor} stroke="rgba(0,0,0,0.18)" strokeWidth="1"/>
      {[102,112,122,132,142,152,162,172,182,192].map((x,i)=>(
        <line key={i} x1={x} y1="98" x2={x-4} y2="192" stroke="rgba(255,255,255,0.04)" strokeWidth="2"/>
      ))}
      <text x="150" y="158" textAnchor="middle" fontFamily="'Special Elite',monospace" fontSize="13" fill={labelColor} letterSpacing="1.5" opacity="0.9">typique</text>
      <rect x="128" y="198" width="44" height="9" rx="2" fill={bodyColor} stroke="rgba(0,0,0,0.15)" strokeWidth="1"/>
      <rect x="143" y="199.5" width="14" height="6" rx="1" fill={labelColor} opacity="0.55"/>
    </svg>
  );
}

// ---------- Cabane tchanquée SVG (section "entre sel et soleil") ----------
function CabaneTchanqueeScene() {
  return (
    <svg viewBox="0 0 600 700" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      {/* Ciel coucher de soleil */}
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F2865" />
          <stop offset="35%" stopColor="#3A2C5C" />
          <stop offset="65%" stopColor="#9B5B5C" />
          <stop offset="85%" stopColor="#E39A7C" />
          <stop offset="100%" stopColor="#F4D9B8" />
        </linearGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7A4A52" />
          <stop offset="50%" stopColor="#3A2845" />
          <stop offset="100%" stopColor="#0F2865" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FBE3C2" />
          <stop offset="50%" stopColor="#E39A7C" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#E39A7C" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="600" height="700" fill="url(#sky)" />

      {/* Halo solaire */}
      <circle cx="380" cy="400" r="180" fill="url(#sun)" />
      <circle cx="380" cy="400" r="42" fill="#FBE3C2" opacity="0.95" />

      {/* Eau */}
      <rect y="430" width="600" height="270" fill="url(#water)" />

      {/* Reflet du soleil dans l'eau */}
      <ellipse cx="380" cy="445" rx="60" ry="6" fill="#FBE3C2" opacity="0.7" />
      <ellipse cx="380" cy="465" rx="50" ry="3" fill="#E39A7C" opacity="0.5" />
      <ellipse cx="380" cy="485" rx="40" ry="2" fill="#E39A7C" opacity="0.35" />
      <ellipse cx="380" cy="505" rx="35" ry="2" fill="#E39A7C" opacity="0.25" />
      <ellipse cx="380" cy="525" rx="28" ry="1.5" fill="#E39A7C" opacity="0.18" />
      <ellipse cx="380" cy="545" rx="22" ry="1.2" fill="#E39A7C" opacity="0.12" />

      {/* Cabane tchanquée */}
      <g>
        {/* Pilotis */}
        <rect x="155" y="370" width="6" height="280" fill="#1A1208" />
        <rect x="195" y="370" width="6" height="280" fill="#1A1208" />
        <rect x="235" y="370" width="6" height="280" fill="#1A1208" />
        <rect x="275" y="370" width="6" height="280" fill="#1A1208" />
        {/* Croisillons */}
        <line x1="155" y1="500" x2="201" y2="450" stroke="#1A1208" strokeWidth="3" />
        <line x1="201" y1="500" x2="155" y2="450" stroke="#1A1208" strokeWidth="3" />
        <line x1="235" y1="500" x2="281" y2="450" stroke="#1A1208" strokeWidth="3" />
        <line x1="281" y1="500" x2="235" y2="450" stroke="#1A1208" strokeWidth="3" />
        {/* Plancher */}
        <rect x="140" y="365" width="160" height="8" fill="#1A1208" />
        {/* Cabane */}
        <rect x="155" y="290" width="130" height="80" fill="#1A1208" />
        {/* Toit */}
        <polygon points="145,290 220,250 295,290" fill="#0A0804" />
        {/* Fenêtre */}
        <rect x="200" y="310" width="22" height="22" fill="#FBE3C2" opacity="0.85" />
        <line x1="211" y1="310" x2="211" y2="332" stroke="#1A1208" strokeWidth="1" />
        <line x1="200" y1="321" x2="222" y2="321" stroke="#1A1208" strokeWidth="1" />
        {/* Échelle */}
        <line x1="180" y1="370" x2="172" y2="640" stroke="#1A1208" strokeWidth="2" />
        <line x1="195" y1="370" x2="187" y2="640" stroke="#1A1208" strokeWidth="2" />
      </g>

      {/* Reflet cabane dans l'eau */}
      <g opacity="0.3">
        <rect x="155" y="430" width="130" height="60" fill="#1A1208" />
        <polygon points="145,490 220,510 295,490" fill="#1A1208" />
      </g>

      {/* Oiseau au loin */}
      <path d="M100 200 Q108 195, 116 200 Q124 195, 132 200" stroke="#1A1208" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M450 240 Q458 235, 466 240 Q474 235, 482 240" stroke="#1A1208" strokeWidth="1.2" fill="none" opacity="0.5" />
    </svg>);

}

// ---------- HERO : vidéo de fond + voile navy ----------
function HeroScene() {
  const videoRef = React.useRef(null);
  const [videoReady, setVideoReady] = React.useState(false);

  React.useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const tryPlay = () => {
      vid.play().then(() => setVideoReady(true)).catch(() => {});
    };

    tryPlay();
    vid.addEventListener('canplay', tryPlay);
    vid.addEventListener('loadedmetadata', tryPlay);
    vid.addEventListener('playing', () => setVideoReady(true));

    const onVisible = () => { if (!document.hidden) tryPlay(); };
    document.addEventListener('visibilitychange', onVisible);

    // Fallback iOS : au premier touch l'utilisateur débloque l'autoplay
    const onTouch = () => tryPlay();
    document.addEventListener('touchstart', onTouch, { once: true });

    return () => {
      vid.removeEventListener('canplay', tryPlay);
      vid.removeEventListener('loadedmetadata', tryPlay);
      vid.removeEventListener('playing', () => setVideoReady(true));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-start-playback-button { display:none!important; -webkit-appearance:none; }
      `}</style>

      {/* Vidéo de fond — 540p sur mobile, 720p sinon ; l'image d'aperçu s'affiche pendant le chargement */}
      <video
        ref={videoRef}
        autoPlay muted loop playsInline
        preload="auto"
        poster={HERO_POSTER}
        disablePictureInPicture
        x-webkit-airplay="deny"
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center center',
          pointerEvents: 'none',
        }}
        src={window.matchMedia('(max-width: 767px)').matches ? HERO_540 : HERO_720}
      />
      
      {/* Voile navy semi-transparent (selon brief : rgba(15,40,101,0.35)) */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15,40,101,0.32)' }} />
      {/* Léger fondu sombre en haut pour le confort de la nav */}
      <div
        className="absolute inset-x-0 top-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(10,31,61,0.45) 0%, rgba(10,31,61,0) 100%)' }} />
      
      {/* Léger fondu sombre en bas pour faire ressortir l'indicateur de scroll */}
      <div
        className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(0deg, rgba(10,31,61,0.4) 0%, rgba(10,31,61,0) 100%)' }} />
      
      {/* Vignette douce centrée pour faire respirer le titre */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(10,31,61,0.0) 35%, rgba(10,31,61,0.35) 100%)'
        }} />
      
    </div>);

}

// ---------- Section Définition (machine à écrire) ----------
function DefinitionSection() {
  const reduceMotion = usePrefersReducedMotion();
  const sectionRef = useRef(null);
  const [step, setStep] = useState(0);
  // step values:
  //   0 = pas démarré
  //   1 = tape "typique"
  //   2 = tape " [tchipik]"
  //   3 = pause avant adj
  //   4 = tape la définition adj
  //   5 = pause avant n.f.
  //   6 = tape n.f. partie 1 (avant terracotta)
  //   7 = tape "entre sel et soleil"
  //   8 = tape n.f. partie 2 (après terracotta)
  //   9 = terminé

  // Démarre l'animation à la première entrée dans le viewport (une seule fois)
  useEffect(() => {
    if (!sectionRef.current) return;
    if (reduceMotion) {
      setStep(9);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStep((s) => s === 0 ? 1 : s);
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [reduceMotion]);

  // Pauses entre certaines étapes
  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => setStep(4), 400);
      return () => clearTimeout(t);
    }
    if (step === 5) {
      const t = setTimeout(() => setStep(6), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  const advance = () => setStep((s) => s + 1);
  const isDone = step >= 9;

  // Pour l'accessibilité : texte complet en sr-only quand on est en mode animation
  const fullDef = `typique [tchipik]. adj. Qui caractérise sans qu'on sache l'expliquer. n.f. Vêtements oversize, pensés pour celles et ceux qui vivent entre sel et soleil. Un pied dans l'Atlantique, l'autre dans la Méditerranée.`;

  return (
    <section
      id="definition"
      ref={sectionRef}
      className="relative py-20 md:py-40 px-6"
      style={{ backgroundColor: '#F4F1EC' }}>
      
      <div className="max-w-2xl mx-auto text-center">
        {/* Texte accessible complet pour les lecteurs d'écran */}
        <span className="sr-only">{fullDef}</span>

        <div className="text-left md:text-center" aria-hidden={!isDone} style={{ color: '#0F2865' }}>
          {/* Ligne 1 : typique [tchipik] */}
          <p className="mb-4" style={{ minHeight: '1.2em' }}>
            <span className="font-american-tw text-3xl md:text-5xl">
              <Typewriter
                text="typique"
                start={step >= 1}
                speed={95}
                onDone={() => step === 1 && advance()}
                showCursor={step === 1}
                instant={reduceMotion} />
              
            </span>
            <span className="font-american-tw ml-3 text-xl md:text-2xl" style={{ opacity: 0.7 }}>
              <Typewriter
                text="[tchipik]"
                start={step >= 2}
                speed={85}
                onDone={() => step === 2 && setStep(3)}
                showCursor={step === 2}
                instant={reduceMotion} />
              
            </span>
          </p>

          {/* Ligne 2 : adj. */}
          <p
            className="font-serif text-lg md:text-xl leading-relaxed mb-3"
            style={{ minHeight: '1.6em', visibility: step >= 4 || reduceMotion ? 'visible' : 'hidden' }}>
            
            <span className="font-serif-fine italic" style={{ opacity: 0.7 }}>adj.</span>{' '}
            <Typewriter
              text="Qui caractérise sans qu'on sache l'expliquer."
              start={step >= 4}
              speed={28}
              onDone={() => step === 4 && setStep(5)}
              showCursor={step === 4}
              instant={reduceMotion} />
            
          </p>

          {/* Ligne 3 : n.f. (en trois segments pour conserver le terracotta italique) */}
          <p
            className="font-serif text-lg md:text-xl leading-relaxed"
            style={{ minHeight: '3.2em', visibility: step >= 6 || reduceMotion ? 'visible' : 'hidden' }}>
            
            <span className="font-serif-fine italic" style={{ opacity: 0.7 }}>n.f.</span>{' '}
            <Typewriter
              text="Vêtements oversize, pensés pour celles et ceux qui vivent "
              start={step >= 6}
              speed={26}
              onDone={() => step === 6 && setStep(7)}
              showCursor={step === 6}
              instant={reduceMotion} />
            
            <span style={{ color: '#E39A7C', fontStyle: 'italic' }}>
              <Typewriter
                text="entre sel et soleil"
                start={step >= 7}
                speed={42}
                onDone={() => step === 7 && setStep(8)}
                showCursor={step === 7}
                instant={reduceMotion} />
              
            </span>
            <Typewriter
              text=". Un pied dans l'Atlantique, l'autre dans la Méditerranée."
              start={step >= 8}
              speed={26}
              onDone={() => step === 8 && setStep(9)}
              showCursor={step === 8}
              instant={reduceMotion} />
            
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <WaveDivider color="#0F2865" width={140} strokeWidth={1} />
        </div>
      </div>
    </section>);

}

// ============================================================
// CART SIDEBAR
// ============================================================
function CartSidebar({ items, onClose, onRemove, onUpdateQty, total, cartCount, onCheckout, verification }) {
  const epuisees = items.filter(i => i.epuise).length;
  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(10,31,61,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      {/* Sidebar */}
      <div className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{ width: 'min(420px, 100vw)', backgroundColor: '#F4F1EC', boxShadow: '-8px 0 40px rgba(10,31,61,0.18)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-6" style={{ borderBottom: '1px solid rgba(15,40,101,0.1)' }}>
          <div>
            <p className="font-typewriter text-xs tracking-[0.35em] uppercase" style={{ color: '#E39A7C' }}>Panier</p>
            <p className="font-serif-fine italic text-sm mt-0.5" style={{ opacity: 0.6 }}>{cartCount} pièce{cartCount > 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="font-typewriter text-xs tracking-wider" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F2865', opacity: 0.5 }}>✕ Fermer</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
          {items.length === 0 ? (
            <p className="font-serif-fine italic text-center mt-16" style={{ opacity: 0.45 }}>Ton panier est vide.</p>
          ) : items.map(item => (
            <div key={item.key} className="flex gap-4 pb-5" style={{ borderBottom: '1px solid rgba(15,40,101,0.08)' }}>
              <div className="w-16 h-16 flex-shrink-0" style={{ backgroundColor: item.product.bg, borderRadius: '2px', overflow: 'hidden' }}>
                {item.product.photos && item.product.photos.length > 0
                  ? <img src={item.product.photos[0]} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ transform: 'scale(0.7)', transformOrigin: 'center', width: '100%', height: '100%' }}>{item.product.mockup}</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-typewriter text-sm mb-0.5">{item.product.name}</p>
                <p className="font-serif-fine italic text-xs mb-2" style={{ opacity: 0.5 }}>Taille {item.size}{item.epuise ? ' · plus disponible' : ''}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onUpdateQty(item.key, -1)} className="w-6 h-6 flex items-center justify-center font-typewriter text-xs" style={{ border: '1px solid rgba(15,40,101,0.2)', borderRadius: '2px', background: 'none', cursor: 'pointer', color: '#0F2865' }}>−</button>
                    <span className="font-typewriter text-sm w-4 text-center">{item.qty}</span>
                    <button onClick={() => onUpdateQty(item.key, 1)} className="w-6 h-6 flex items-center justify-center font-typewriter text-xs" style={{ border: '1px solid rgba(15,40,101,0.2)', borderRadius: '2px', background: 'none', cursor: 'pointer', color: '#0F2865' }}>+</button>
                  </div>
                  <p className="font-serif text-sm">{eurosFr(item.priceNum * item.qty)} €</p>
                </div>
              </div>
              <button onClick={() => onRemove(item.key)} className="font-typewriter text-[10px] self-start mt-1" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, color: '#0F2865' }}>✕</button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-7 py-6" style={{ borderTop: '1px solid rgba(15,40,101,0.1)' }}>
            <div className="flex justify-between mb-6">
              <span className="font-typewriter text-sm tracking-wider uppercase" style={{ opacity: 0.6 }}>Total</span>
              <span className="font-serif text-2xl">{eurosFr(total)} €</span>
            </div>
            {epuisees > 0 && (
              <p className="font-typewriter text-[11px] tracking-wider mb-5" style={{ borderLeft: '2px solid #E39A7C', paddingLeft: 12, lineHeight: 1.6 }}>
                {epuisees > 1 ? 'Des pièces de ton panier ne sont plus disponibles.' : 'Une pièce de ton panier n\'est plus disponible.'} Retire-la pour continuer.
              </p>
            )}
            <div className="space-y-3">
              <button
                onClick={onCheckout}
                disabled={verification || epuisees > 0}
                className="w-full py-4 font-typewriter text-sm tracking-widest uppercase"
                style={{ backgroundColor: '#E39A7C', color: '#F4F1EC', border: 'none', borderRadius: '2px', cursor: verification || epuisees > 0 ? 'default' : 'pointer', opacity: verification || epuisees > 0 ? 0.5 : 1 }}>
                {verification ? 'Vérification…' : 'Commander →'}
              </button>
              <button
                onClick={() => { onClose(); setTimeout(() => { const el = document.getElementById('boutique'); if(el) el.scrollIntoView({behavior:'smooth'}); }, 100); }}
                className="w-full py-3 font-typewriter text-xs tracking-widest uppercase"
                style={{ backgroundColor: 'transparent', color: '#0F2865', border: '1px solid rgba(15,40,101,0.2)', borderRadius: '2px', cursor: 'pointer', opacity: 0.7 }}>
                ← Continuer mes achats
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// COORDONNÉES ET TARIF PARTAGÉS PAR LES TEXTES (CGV, aide, pied de page)
// ============================================================
// tools/extract_legal.js lit ces deux lignes `const` pour construire /legal/ : garder une ligne par constante.
// FRAIS_COLISSIMO doit rester identique au tarif de Shopify (Paramètres > Marchés > France > Expédition).
const FRAIS_COLISSIMO = '6,90 €';
const EMAIL_CONTACT = 'typique.fr@gmail.com';

// ============================================================
// LEGAL MODAL — CGV / Mentions légales / Confidentialité
// ============================================================
const LEGAL_CONTENT = {
  mentions: {
    title: 'Mentions légales',
    sections: [
      {
        heading: 'Éditeur du site',
        text: `Raison sociale : Typique\nNom : Coline Chartier\nAdresse : 58 rue Denise Vernay, 13330 Pélissanne, France\nSIRET : 94116866800015\nEmail : ${EMAIL_CONTACT}\nSite : www.boutiquetypique.fr`
      },
      {
        heading: 'Hébergement',
        text: `Ce site est hébergé par Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, USA (vercel.com)`
      },
      {
        heading: 'Propriété intellectuelle',
        text: `L'ensemble des contenus présents sur ce site (textes, photographies, visuels, logo) sont la propriété exclusive de Typique / Coline Chartier. Toute reproduction, même partielle, est interdite sans autorisation préalable écrite.`
      },
      {
        heading: 'Responsabilité',
        text: `Typique s'efforce de maintenir les informations publiées à jour mais ne saurait être tenu responsable d'erreurs, omissions ou résultats obtenus d'une mauvaise utilisation de ces informations.`
      }
    ]
  },
  cgv: {
    title: 'Conditions Générales de Vente',
    sections: [
      {
        heading: '1. Vendeur',
        text: `Coline Chartier, Typique\n58 rue Denise Vernay, 13330 Pélissanne\nSIRET : 94116866800015\nEmail : ${EMAIL_CONTACT}`
      },
      {
        heading: '2. Produits',
        text: `Les produits proposés à la vente sont des articles de prêt-à-porter (t-shirts, sweats, accessoires) fabriqués en quantités limitées. Les caractéristiques essentielles de chaque produit (description, taille, prix) sont présentées sur le site.`
      },
      {
        heading: '3. Prix',
        text: `Les prix sont indiqués en euros TTC. En tant que micro-entrepreneur sous le régime de franchise en base de TVA (article 293 B du CGI), la TVA n'est pas applicable. Typique se réserve le droit de modifier ses prix à tout moment, mais les produits seront facturés sur la base du tarif en vigueur au moment de la validation de la commande. Les éventuels frais de livraison, indiqués à l'article 6, s'ajoutent au prix des produits et sont affichés avant la validation de la commande.`
      },
      {
        heading: '4. Commandes : modèle drop',
        text: `Les ventes s'effectuent par périodes limitées appelées "drops". Le paiement est immédiat et effectué au moment de la commande, sur la page de paiement sécurisée de Shopify. Les commandes passées lors d'un drop sont expédiées en lot après la fermeture de la période de vente. La livraison à domicile est assurée uniquement en France métropolitaine.`
      },
      {
        heading: '5. Paiement',
        text: `Le paiement s'effectue en ligne, sur la page de paiement sécurisée de Shopify, par les moyens proposés au moment de la commande : carte bancaire, Apple Pay, PayPal ou Klarna. La commande est validée à réception du paiement. Aucune donnée bancaire n'est conservée par Typique.`
      },
      {
        heading: '6. Livraison',
        text: `Livraison à domicile : Colissimo, en France métropolitaine uniquement, au tarif de ${FRAIS_COLISSIMO} par commande. Les commandes sont expédiées en lot après la fermeture du drop. Un email de confirmation avec numéro de suivi vous sera envoyé à l'expédition. Les délais indicatifs sont de 3 à 5 jours ouvrés après expédition.\nRetrait : gratuit, à l'adresse indiquée au moment du paiement (Pélissanne). Votre commande est généralement prête en 5 jours ou plus.\nLivraison locale : gratuite, dans un rayon de 100 km autour de Pélissanne, si votre adresse est dans la zone proposée au moment du paiement.`
      },
      {
        heading: '7. Droit de rétractation',
        text: `Conformément à l'article L221-18 du Code de la consommation, vous disposez d'un délai de 14 jours à compter de la réception de votre commande pour exercer votre droit de rétractation, sans avoir à justifier de motifs.\nPour l'exercer, informez-nous de votre décision avant la fin de ce délai, par email à ${EMAIL_CONTACT}, en indiquant clairement que vous vous rétractez. Vous pouvez utiliser le modèle de formulaire ci-dessous.\nVous renvoyez ensuite le ou les articles sans retard excessif et au plus tard 14 jours après nous avoir informés de votre décision. Les frais de retour sont à votre charge.\nNous vous remboursons la totalité des sommes versées, y compris les frais de livraison standard, sans retard excessif et au plus tard 14 jours après avoir été informés de votre décision de vous rétracter. Nous pouvons différer ce remboursement jusqu'à la réception des articles ou jusqu'à ce que vous ayez fourni une preuve d'expédition, la date retenue étant celle du premier de ces faits. Le remboursement est effectué par le même moyen de paiement que celui utilisé pour la commande.`
      },
      {
        heading: 'Modèle de formulaire de rétractation',
        text: `(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)\nÀ l'attention de Coline Chartier, Typique, 58 rue Denise Vernay, 13330 Pélissanne, ${EMAIL_CONTACT} :\nJe/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la vente du bien ci-dessous :\nCommandé le (*) / reçu le (*) :\nNom du (des) consommateur(s) :\nAdresse du (des) consommateur(s) :\nSignature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :\nDate :\n(*) Rayez la mention inutile.`
      },
      {
        heading: '8. Garanties légales',
        text: `Typique répond des défauts de conformité qui existent au moment de la délivrance du bien (garantie légale de conformité, articles L217-3 et suivants du Code de la consommation) et des vices cachés de la chose vendue (articles 1641 et suivants du Code civil).\nUn défaut de conformité qui apparaît dans les 2 ans suivant la délivrance du bien est présumé exister au moment de la délivrance. Vous pouvez alors demander la réparation ou le remplacement du bien, dans les conditions prévues par la loi. L'action pour vice caché doit être engagée dans les 2 ans suivant la découverte du vice.\nPour toute demande, écrivez-nous à ${EMAIL_CONTACT}.`
      },
      {
        heading: '9. Réclamations',
        text: `Pour toute réclamation, contactez-nous à ${EMAIL_CONTACT}. En cas de litige, une solution amiable sera recherchée avant tout recours judiciaire.`
      },
      {
        heading: '10. Droit applicable',
        text: `Les présentes CGV sont soumises au droit français. Tout litige relatif à leur interprétation ou à leur exécution relève des tribunaux compétents selon les règles de droit commun.`
      }
    ]
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    sections: [
      {
        heading: 'Responsable du traitement',
        text: `Coline Chartier, Typique\n58 rue Denise Vernay, 13330 Pélissanne\nEmail : ${EMAIL_CONTACT}`
      },
      {
        heading: 'Données collectées',
        text: `Lors d'une commande : nom, prénom, adresse de livraison, adresse email, numéro de téléphone.\nAucune donnée bancaire n'est collectée ou conservée par Typique. Le paiement est traité par Shopify Payments ou par le service de paiement que vous choisissez (PayPal, Klarna).`
      },
      {
        heading: 'Finalités du traitement',
        text: `Les données collectées sont utilisées pour :\n• Traiter et expédier vos commandes\n• Vous envoyer votre confirmation de commande et suivi de livraison\n• Respecter nos obligations légales et comptables`
      },
      {
        heading: 'Base légale',
        text: `Le traitement de vos données est fondé sur l'exécution du contrat de vente (commandes) et notre intérêt légitime (gestion administrative).`
      },
      {
        heading: 'Durée de conservation',
        text: `Données de commande : 10 ans (obligation comptable légale).`
      },
      {
        heading: 'Vos droits',
        text: `Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Pour exercer ces droits, écrivez à ${EMAIL_CONTACT}. Vous avez également le droit d'introduire une réclamation auprès de la CNIL (cnil.fr).`
      },
      {
        heading: 'Cookies',
        text: `Ce site n'utilise pas de cookies de traçage ou publicitaires. Des cookies techniques strictement nécessaires au fonctionnement du site peuvent être déposés.`
      },
      {
        heading: 'Sous-traitants',
        text: `Shopify Inc. (paiement et gestion des commandes), conforme RGPD.\nVercel Inc. (hébergement), conforme RGPD.\nLa Poste (Colissimo : livraison des commandes).`
      }
    ]
  }
};

// ============================================================
// AIDE : LIVRAISON ET RETOURS, FAQ
// ============================================================
// Mêmes règles que les CGV (France métropolitaine, 3 à 5 jours ouvrés, 14 jours, retour à la charge du client).
// Aucune date de livraison ni d'expédition n'est annoncée : choix de Coline.
const AIDE_CONTENT = {
  livraison: {
    title: 'Livraison et retours',
    sections: [
      {
        heading: 'Livraison à domicile',
        text: `Colissimo, ${FRAIS_COLISSIMO}, en France métropolitaine uniquement. Les frais s'affichent avant le paiement.\nLes commandes passées pendant un drop sont expédiées en lot après sa fermeture. Tu reçois un email avec ton numéro de suivi quand ta commande part, puis Colissimo livre en 3 à 5 jours ouvrés.`
      },
      {
        heading: 'Retrait gratuit à Pélissanne',
        text: `Choisis le retrait au moment du paiement, l'adresse s'y affiche. Ta commande est généralement prête en 5 jours ou plus.`
      },
      {
        heading: 'Livraison locale gratuite',
        text: `Dans un rayon de 100 km autour de Pélissanne, la livraison locale est gratuite. Elle apparaît au moment du paiement si ton adresse est dans la zone.`
      },
      {
        heading: 'Retours',
        text: `Tu as 14 jours à partir de la réception de ta commande pour te rétracter, sans avoir à donner de raison. Pour cela, écris-nous à ${EMAIL_CONTACT} : nous te répondons avec la marche à suivre. Tu renvoies ensuite ton colis dans les 14 jours après nous avoir prévenus.\nLes frais de retour sont à ta charge. Nous te remboursons, frais de livraison standard compris, au plus tard 14 jours après avoir été prévenus de ta rétractation. Nous pouvons attendre de recevoir ton colis (ou la preuve de son envoi) avant de te rembourser.`
      },
      {
        heading: 'Un souci avec ta commande ?',
        text: `Article abîmé, erreur dans ta commande, colis qui n'arrive pas : écris-nous à ${EMAIL_CONTACT}.`
      }
    ]
  },
  faq: {
    title: 'Questions fréquentes',
    sections: [
      {
        heading: 'Quelle taille choisir ?',
        text: `Les pièces Typique sont coupées oversize. Pour les t-shirts du Drop 01 (Le Ferret, L'Entre Deux, Sable chaud), nous conseillons aux femmes de prendre une taille en dessous de leur taille habituelle.`
      },
      {
        heading: 'Combien coûte la livraison ?',
        text: `Colissimo à domicile : ${FRAIS_COLISSIMO}, en France métropolitaine. Le retrait à Pélissanne est gratuit, et la livraison locale aussi, dans un rayon de 100 km.`
      },
      {
        heading: 'Quand vais-je recevoir ma commande ?',
        text: `Pour la livraison à domicile, les commandes passées pendant un drop sont expédiées en lot après sa fermeture. Tu reçois un email avec ton numéro de suivi quand ta commande part, puis Colissimo livre en 3 à 5 jours ouvrés. Pour le retrait, ta commande est généralement prête en 5 jours ou plus.`
      },
      {
        heading: 'Puis-je retourner un article ?',
        text: `Oui. Tu as 14 jours à partir de la réception pour te rétracter, sans donner de raison. Écris-nous à ${EMAIL_CONTACT}. Les frais de retour sont à ta charge. Le détail est dans l'onglet « Livraison et retours ».`
      },
      {
        heading: 'Et si la taille ne me va pas ?',
        text: `Tu peux te rétracter dans les 14 jours, comme pour tout retour. Les pièces sont fabriquées en quantités limitées : une autre taille peut être épuisée.`
      },
      {
        heading: 'Comment entretenir mes pièces ?',
        text: `Lave-les à 30° et à l'envers.`
      },
      {
        heading: 'Le paiement est-il sécurisé ?',
        text: `Oui. Tu paies sur la page de paiement sécurisée de Shopify, par carte bancaire, Apple Pay, PayPal ou Klarna selon ce qui t'est proposé. Typique ne collecte et ne conserve aucune donnée bancaire.`
      }
    ]
  }
};

// Rend cliquables les adresses email d'un texte (pour écrire d'un geste depuis un téléphone).
function texteAvecMails(texte) {
  return texte.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g).map((morceau, i) =>
    i % 2 === 1
      ? <a key={i} href={`mailto:${morceau}`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>{morceau}</a>
      : morceau
  );
}

function LegalModal({ page, onClose }) {
  // Deux familles de pages dans la même fenêtre : l'aide aux clients (livraison, FAQ) et les textes légaux.
  const estAide = page in AIDE_CONTENT;
  const pages = estAide ? [
    { key: 'livraison', label: 'Livraison et retours' },
    { key: 'faq', label: 'FAQ' },
  ] : [
    { key: 'mentions', label: 'Mentions légales' },
    { key: 'cgv', label: 'CGV' },
    { key: 'confidentialite', label: 'Confidentialité' },
  ];

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Le défilement est rendu tel qu'on l'a trouvé : la fenêtre peut s'ouvrir par-dessus une fiche produit.
    const defilementAvant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = defilementAvant;
    };
  }, []);

  const [activePage, setActivePage] = useState(page);
  const c = LEGAL_CONTENT[activePage] || AIDE_CONTENT[activePage];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 19999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,40,101,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        backgroundColor: '#F4F1EC',
        borderRadius: '2px',
        width: '92vw', maxWidth: 760,
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px -16px rgba(15,40,101,0.4)'
      }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 0', borderBottom: '1px solid rgba(15,40,101,0.1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p className="font-typewriter text-xs tracking-[0.3em] uppercase" style={{ opacity: 0.45 }}>{estAide ? 'Aide' : 'Informations légales'}</p>
            <button onClick={onClose} style={{ background: 'rgba(15,40,101,0.08)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865', fontSize: 16 }}>✕</button>
          </div>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 0 }}>
            {pages.map(pg => (
              <button key={pg.key} onClick={() => setActivePage(pg.key)}
                className="font-typewriter text-xs tracking-wider"
                style={{
                  padding: '10px 18px', border: 'none', cursor: 'pointer',
                  background: 'none', borderBottom: activePage === pg.key ? '2px solid #0F2865' : '2px solid transparent',
                  color: activePage === pg.key ? '#0F2865' : 'rgba(15,40,101,0.45)',
                  fontWeight: activePage === pg.key ? 600 : 400,
                  transition: 'all 0.2s'
                }}>{pg.label}</button>
            ))}
          </div>
        </div>

        {/* Contenu défilable */}
        <div style={{ overflowY: 'auto', padding: '28px 32px 36px', flex: 1 }}>
          <h2 className="font-serif" style={{ fontSize: '1.4rem', marginBottom: 24, color: '#0F2865' }}>{c.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {c.sections.map((s, i) => (
              <div key={i}>
                <h3 className="font-typewriter text-xs tracking-[0.25em] uppercase mb-3" style={{ color: '#E39A7C' }}>{s.heading}</h3>
                <p className="font-serif-fine text-sm leading-relaxed" style={{ color: '#0F2865', opacity: 0.8, whiteSpace: 'pre-line' }}>{estAide ? texteAvecMails(s.text) : s.text}</p>
              </div>
            ))}
          </div>
          {!estAide && (
            <p className="font-serif-fine italic text-xs mt-10" style={{ opacity: 0.4 }}>
              Dernière mise à jour : {DROP_REGLAGE.textesLegauxMisAJour}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CHOIX DE LA TAILLE — partagé par la carte et la fiche détaillée
// ============================================================
// Les tailles viennent de Shopify. Une taille épuisée est grisée, barrée et ne peut pas être choisie.
function ChoixTaille({ p, taille, onChoisir, compact }) {
  const marge = compact ? 'mb-4' : 'mb-6';
  if (p.stockEtat === 'chargement') {
    return (
      <div className={`flex flex-wrap gap-1.5 ${marge}`} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map(i => <span key={i} style={{ width: 34, height: compact ? 26 : 30, borderRadius: '2px', backgroundColor: 'rgba(15,40,101,0.07)' }} />)}
      </div>
    );
  }
  if (p.sizes.length > 1) {
    return (
      <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'} ${marge}`}>
        {p.sizes.map(s => (
          <button key={s.label} onClick={(e) => { e.stopPropagation(); onChoisir(s.label); }}
            disabled={!s.dispo}
            aria-label={s.dispo ? s.label : `${s.label}, épuisée`}
            title={s.dispo ? undefined : 'Épuisée'}
            className={`font-typewriter tracking-wider transition-all duration-200 ${compact ? 'text-[11px] px-2.5 py-1' : 'text-xs px-3 py-1.5'}`}
            style={{
              borderRadius: '2px', border: '1px solid',
              borderColor: taille === s.label ? '#0F2865' : 'rgba(15,40,101,0.2)',
              backgroundColor: taille === s.label ? '#0F2865' : 'transparent',
              color: taille === s.label ? '#F4F1EC' : 'rgba(15,40,101,0.6)',
              cursor: s.dispo ? 'pointer' : 'not-allowed',
              opacity: s.dispo ? 1 : 0.35,
              textDecoration: s.dispo ? 'none' : 'line-through'
            }}>{s.label}</button>
        ))}
      </div>
    );
  }
  if (p.sizes.length === 1) {
    return <p className={`font-typewriter text-[11px] tracking-wider ${marge}`} style={{ opacity: 0.45 }}>{p.sizes[0].label}</p>;
  }
  return null;
}

// Le prix de la taille choisie, ou un emplacement vide pendant la lecture de Shopify.
function PrixPiece({ p, taille, className, style }) {
  if (p.stockEtat === 'chargement') {
    return <span aria-hidden="true" style={{ display: 'inline-block', width: 52, height: 22, borderRadius: '2px', backgroundColor: 'rgba(15,40,101,0.07)' }} />;
  }
  const info = p.sizes.find(s => s.label === taille) || p.sizes[0];
  return <span className={className} style={style}>{info ? info.prix : ''}</span>;
}

// ============================================================
// PRODUCT CARD
// ============================================================
function ProductCard({ product: p, onAddToCart, dropStatus, onOpenDetail }) {
  const [selectedSize, setSelectedSize] = useState(null);
  const [buying, setBuying] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const taille = tailleChoisie(p, selectedSize);
  const etat = etatAchat(p, dropStatus, taille);
  const isOpen = etat === 'ouvert';
  const hasPhotos = p.photos && p.photos.length > 0;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!isOpen) return;
    onAddToCart(p, taille);
  };

  const handlePhotoNav = (e, fn) => {
    e.stopPropagation();
    setPhotoIdx(fn);
  };

  return (
    <article className="product-card relative overflow-hidden flex flex-col"
      style={{ backgroundColor: '#FFFFFF', borderRadius: '2px', boxShadow: '0 14px 40px -28px rgba(15,40,101,0.3)', cursor: 'pointer' }}
      onClick={() => onOpenDetail(p)}>

      {/* VISUEL */}
      <div className="relative overflow-hidden" style={{ backgroundColor: p.bg, aspectRatio: hasPhotos ? '3/4' : '1/1' }}>
        {hasPhotos ? (
          <>
            <img src={p.photos[photoIdx]} alt={p.name}
              loading="lazy" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 0.25s' }} />
            {p.photos.length > 1 && (
              <>
                <button onClick={(e) => handlePhotoNav(e, i => (i - 1 + p.photos.length) % p.photos.length)}
                  style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(244,241,236,0.88)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865' }}>‹</button>
                <button onClick={(e) => handlePhotoNav(e, i => (i + 1) % p.photos.length)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(244,241,236,0.88)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865' }}>›</button>
                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                  {p.photos.map((_, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }}
                      style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.2s',
                        backgroundColor: photoIdx === i ? '#0F2865' : 'rgba(255,255,255,0.75)' }} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : p.mockup}
      </div>

      {/* INFOS */}
      <div className="p-5 flex flex-col flex-1" style={{ color: '#0F2865' }}>
        <p className="font-serif-fine italic text-xs uppercase tracking-[0.3em] mb-1.5" style={{ opacity: 0.5 }}>{p.cat === 'SWEATS' ? 'HOODIES' : p.cat}</p>
        <h3 className="font-typewriter text-lg mb-2">{p.name}</h3>
        <p className="font-serif text-sm leading-relaxed mb-3 flex-1" style={{ opacity: 0.72 }}>{p.desc}</p>
        <div className="mt-auto">
          {/* Swatch couleur */}
          {p.color && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '2px', flexShrink: 0,
                backgroundColor: p.color.hex,
                border: '1px solid rgba(15,40,101,0.18)',
                backgroundImage: p.color.washed ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px)' : 'none'
              }} />
              <span className="font-typewriter text-[10px] tracking-wider" style={{ color: '#0F2865', opacity: 0.55 }}>{p.color.label}</span>
            </div>
          )}
          <ChoixTaille p={p} taille={taille} onChoisir={setSelectedSize} compact />
          <div className="flex items-center justify-between">
            <PrixPiece p={p} taille={taille} className="font-serif text-xl" />
            <button onClick={handleAdd}
              className="font-typewriter text-xs tracking-wider uppercase px-4 py-2.5 transition-all duration-300"
              style={{
                borderRadius: '2px',
                backgroundColor: buying ? 'rgba(15,40,101,0.25)' : isOpen ? '#E39A7C' : 'rgba(15,40,101,0.12)',
                color: isOpen || buying ? '#F4F1EC' : 'rgba(15,40,101,0.4)',
                border: 'none', cursor: isOpen && !buying ? 'pointer' : 'default',
                opacity: buying ? 0.7 : 1
              }}>
              {{ ouvert: '+ Panier', chargement: '…', indisponible: 'Indisponible' }[etat] || 'Bientôt'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// PRODUCT MODAL — aperçu détaillé au clic
// ============================================================
function ProductModal({ product: p, onClose, onAddToCart, dropStatus, onOpenAide, aideOuverte }) {
  // Échap ferme la fenêtre du dessus : si « Livraison et retours » est ouverte par-dessus la fiche, la fiche reste.
  const aideRef = useRef(false);
  aideRef.current = aideOuverte;
  const [selectedSize, setSelectedSize] = useState(null);
  const [buying, setBuying] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const taille = tailleChoisie(p, selectedSize);
  const etat = etatAchat(p, dropStatus, taille);
  const isOpen = etat === 'ouvert';
  const hasPhotos = p.photos && p.photos.length > 0;

  // Fermer avec Échap + bouton retour navigateur
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !aideRef.current) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Bouton retour navigateur → ferme la modale
    window.history.pushState({ modal: p.id }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const handleAdd = () => {
    if (!isOpen) return;
    onAddToCart(p, taille);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 19999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Overlay */}
      <div onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,40,101,0.55)', backdropFilter: 'blur(4px)' }} />

      {/* Panneau */}
      <div style={{
        position: 'relative', zIndex: 1,
        backgroundColor: '#F4F1EC',
        borderRadius: '2px',
        width: '92vw', maxWidth: 900,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 32px 80px -16px rgba(15,40,101,0.4)'
      }}>
        {/* Bouton fermer — toujours visible en tête du panneau */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0', backgroundColor: '#F4F1EC', zIndex: 2 }}>
          <button onClick={onClose}
            style={{ background: 'rgba(15,40,101,0.08)', border: 'none', borderRadius: '50%', width: 38, height: 38, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865', fontSize: 17, touchAction: 'manipulation' }}>✕</button>
        </div>

        {/* Contenu défilable */}
        <div style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', flex: 1, minHeight: 0 }}
          className="modal-inner">

          {/* COLONNE GAUCHE — photos */}
          <div style={{ flex: '0 0 50%', position: 'relative', backgroundColor: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            className="modal-photo-col">
            {hasPhotos ? (
              <>
                <img src={p.photos[photoIdx]} alt={p.name}
                  onClick={() => setLightbox(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
                {p.photos.length > 1 && (
                  <>
                    <button onPointerUp={() => setPhotoIdx(i => (i - 1 + p.photos.length) % p.photos.length)}
                      style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(244,241,236,0.88)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865', touchAction: 'manipulation' }}>‹</button>
                    <button onPointerUp={() => setPhotoIdx(i => (i + 1) % p.photos.length)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(244,241,236,0.88)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F2865', touchAction: 'manipulation' }}>›</button>
                    <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 8 }}>
                      {p.photos.map((_, i) => (
                        <button key={i} onPointerUp={() => setPhotoIdx(i)}
                          style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.2s', touchAction: 'manipulation',
                            backgroundColor: photoIdx === i ? '#0F2865' : 'rgba(15,40,101,0.25)' }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ padding: 32 }}>{p.mockup}</div>
            )}
          </div>

          {/* COLONNE DROITE — infos */}
          <div style={{ flex: 1, padding: '40px 36px 36px', overflowY: 'auto', color: '#0F2865', display: 'flex', flexDirection: 'column' }}
            className="modal-info-col">
            <p className="font-serif-fine italic text-xs uppercase tracking-[0.3em] mb-2" style={{ opacity: 0.45 }}>{p.cat === 'SWEATS' ? 'HOODIES' : p.cat}</p>
            <h2 className="font-typewriter mb-3" style={{ fontSize: '1.6rem', lineHeight: 1.15 }}>{p.name}</h2>
            <p className="font-serif leading-relaxed mb-6" style={{ opacity: 0.72, fontSize: '0.95rem' }}>{p.desc}</p>

            {/* Note de taille — uniquement ici */}
            {p.sizeNote && (
              <div style={{ borderLeft: '2px solid #E39A7C', paddingLeft: 14, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.sizeNote.split(' · ').map((line, i) => (
                  <p key={i} className="font-typewriter text-[11px] tracking-wider" style={{ color: '#E39A7C' }}>
                    {i === 0 ? '↳ ' : '  '}{line}
                  </p>
                ))}
              </div>
            )}

            {/* Swatch couleur */}
            {p.color && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '2px', flexShrink: 0,
                  backgroundColor: p.color.hex,
                  border: '1px solid rgba(15,40,101,0.18)',
                  backgroundImage: p.color.washed ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px)' : 'none'
                }} />
                <span className="font-typewriter text-[11px] tracking-wider" style={{ color: '#0F2865', opacity: 0.55 }}>{p.color.label}</span>
              </div>
            )}

            {/* Sélecteur de taille */}
            <ChoixTaille p={p} taille={taille} onChoisir={setSelectedSize} />

            {/* Prix + CTA */}
            <div className="flex items-center justify-between mt-auto">
              <PrixPiece p={p} taille={taille} className="font-serif" style={{ fontSize: '1.5rem' }} />
              <button onClick={handleAdd}
                className="font-typewriter text-sm tracking-widest uppercase px-6 py-3 transition-all duration-300"
                style={{
                  borderRadius: '2px',
                  backgroundColor: buying ? 'rgba(15,40,101,0.25)' : isOpen ? '#E39A7C' : 'rgba(15,40,101,0.12)',
                  color: isOpen || buying ? '#F4F1EC' : 'rgba(15,40,101,0.4)',
                  border: 'none', cursor: isOpen && !buying ? 'pointer' : 'default',
                  opacity: buying ? 0.7 : 1
                }}>
                {{ ouvert: 'Ajouter au panier →', chargement: 'Chargement…', indisponible: 'Indisponible' }[etat] || 'Bientôt disponible'}
              </button>
            </div>

            <button onClick={onOpenAide}
              className="link-under font-typewriter text-[11px] tracking-wider mt-5 self-start"
              style={{ background: 'none', border: 'none', color: '#0F2865', opacity: 0.6, cursor: 'pointer', padding: 0 }}>
              Livraison et retours →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .modal-inner { flex-direction: column !important; overflow-y: auto !important; }
          .modal-photo-col { flex: 0 0 auto !important; width: 100% !important; height: 52vh !important; min-height: unset !important; }
          .modal-info-col { padding: 20px 18px 32px !important; overflow-y: visible !important; flex: 0 0 auto !important; }
          .modal-photo-col img { cursor: zoom-in; }
        }
      `}</style>

      {/* Lightbox plein écran */}
      {lightbox && hasPhotos && (
        <div onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={p.photos[photoIdx]} alt={p.name}
            style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain', display: 'block' }} />
          {p.photos.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + p.photos.length) % p.photos.length); }}
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: 22, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % p.photos.length); }}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: 22, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </>
          )}
          <button onClick={() => setLightbox(false)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontSize: 18, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BOUTIQUE SHOWCASE — sticky scroll (une slide par catégorie)
// ============================================================
function BoutiqueShowcase({ onSelectCategory }) {
  const [activeSlide, setActiveSlide] = React.useState(0);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    let rafId = null;
    function onScroll() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const containerH = containerRef.current.offsetHeight;
        const viewH = window.innerHeight;
        const scrolled = Math.max(0, -rect.top);
        const maxScroll = containerH - viewH;
        const progress = maxScroll > 0 ? Math.min(1, scrolled / maxScroll) : 0;
        const next = Math.min(slides.length - 1, Math.floor(progress * slides.length));
        setActiveSlide(prev => prev !== next ? next : prev);
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  const slides = [
    {
      bg: '#C5BFB3',
      textColor: '#F4F1EC',
      accentColor: '#F4F1EC',
      label: 'Tee-shirts',
      catKey: 'T-SHIRTS',
      ctaLabel: 'Voir les tee-shirts',
      photo: typeof TSHIRT_SHOWCASE !== 'undefined' ? TSHIRT_SHOWCASE : (typeof FERRET_P1 !== 'undefined' ? FERRET_P1 : null),
      photoPosition: 'center center',
      brightness: 0.38,
    },
    {
      bg: '#5A2430',
      textColor: '#F4F1EC',
      accentColor: '#E39A7C',
      label: 'Manches longues',
      catKey: 'MANCHES LONGUES',
      ctaLabel: 'Voir les manches longues',
      photo: typeof MANCHES_LONGUES_SHOWCASE !== 'undefined' ? MANCHES_LONGUES_SHOWCASE : SOLEILCOUCHANT_ARRIERE,
      photoPosition: 'center center',
      brightness: 0.38,
      wrap: true, // deux mots : passe sur deux lignes sur téléphone
    },
    {
      bg: '#0F2865',
      textColor: '#F4F1EC',
      accentColor: '#E39A7C',
      label: 'Hoodies',
      catKey: 'SWEATS',
      ctaLabel: 'Voir les hoodies',
      photo: typeof HOODIES_SHOWCASE !== 'undefined' ? HOODIES_SHOWCASE : (typeof SURFER_P1 !== 'undefined' ? SURFER_P1 : null),
      photoPosition: 'center center',
      brightness: 0.75,
    },
    {
      bg: '#6B6F4A',
      textColor: '#F4F1EC',
      accentColor: '#F4F1EC',
      label: 'Accessoires',
      catKey: 'ACCESSOIRES',
      ctaLabel: 'Voir les accessoires',
      photo: typeof ACCESSOIRES_SHOWCASE !== 'undefined' ? ACCESSOIRES_SHOWCASE : (typeof GARRIGUE_P1 !== 'undefined' ? GARRIGUE_P1 : null),
      photoPosition: 'center center',
      brightness: 0.38,
    },
  ];

  // Hauteurs en CSS (showcase-track / showcase-sticky / showcase-content) : plus de recalcul
  // quand la barre d'adresse iOS apparaît ou disparaît, donc plus de saut pendant le scroll.
  return (
    <div ref={containerRef} className="showcase-track" style={{ position: 'relative' }}>
      <div className="showcase-sticky" style={{
        top: 0,
        overflow: 'hidden',
      }}>
        {/* Fonds — crossfade */}
        {slides.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundColor: s.bg,
            transition: 'opacity 0.7s cubic-bezier(0.4,0,0.2,1)',
            opacity: activeSlide === i ? 1 : 0,
          }} />
        ))}

        {/* Photo produit — plein écran, légèrement transparent */}
        {slides.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            opacity: activeSlide === i ? 1 : 0,
            transition: 'opacity 0.7s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: 'none',
            willChange: 'opacity',
            transform: 'translateZ(0)',
          }}>
            {s.photo && (
              <img src={s.photo} alt={s.label}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: s.photoPosition || 'center center', filter: `brightness(${s.brightness || 0.4})`, transform: 'translateZ(0)' }} />
            )}
          </div>
        ))}

        {/* Contenu — centré verticalement et horizontalement */}
        <div className="showcase-content" style={{
          position: 'relative', zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingLeft: 'max(6vw, 24px)',
          paddingRight: 'max(14vw, 72px)',
        }}>
          {/* Labels catégories */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2em' }}>
            {slides.map((s, i) => {
              const isActive = activeSlide === i;
              const activeColor = slides[activeSlide].textColor;
              return (
                <p
                  key={i}
                  className={isActive ? 'showcase-label-active' : 'showcase-label-inactive'}
                  style={{
                    fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: isActive ? 'clamp(3.8rem, 13vw, 8rem)' : 'clamp(1.4rem, 5vw, 3rem)',
                    lineHeight: 1.05,
                    color: activeColor,
                    opacity: isActive ? 1 : 0.2,
                    transition: 'font-size 0.65s cubic-bezier(0.4,0,0.2,1), opacity 0.65s cubic-bezier(0.4,0,0.2,1)',
                    letterSpacing: '-0.01em',
                    whiteSpace: s.wrap ? 'normal' : 'nowrap',
                    cursor: 'default',
                    userSelect: 'none',
                  }}>
                  {s.label}
                </p>
              );
            })}
          </div>

          {/* CTA par slide */}
          <div style={{ marginTop: '2.5rem', position: 'relative', height: '1.6rem' }}>
            {slides.map((s, i) => (
              <a
                key={i}
                href="#pieces"
                onClick={() => onSelectCategory && onSelectCategory(s.catKey)}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: slides[activeSlide].accentColor,
                  opacity: activeSlide === i ? 0.85 : 0,
                  pointerEvents: activeSlide === i ? 'auto' : 'none',
                  textDecoration: 'none',
                  borderBottom: `1px solid ${slides[activeSlide].accentColor}`,
                  paddingBottom: '2px',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 0.5s, color 0.5s, border-color 0.5s',
                }}
                onMouseEnter={e => { if (activeSlide === i) e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { if (activeSlide === i) e.currentTarget.style.opacity = '0.85'; }}
              >
                {s.ctaLabel} →
              </a>
            ))}
          </div>
        </div>

        {/* Barre de progression verticale — droite */}
        <div style={{
          position: 'absolute', right: 'max(4vw, 20px)', top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          zIndex: 10,
        }}>
          <p style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '0.55rem', letterSpacing: '0.2em',
            color: slides[activeSlide].textColor, opacity: 0.45,
            marginBottom: '4px', transition: 'color 0.5s',
          }}>
            {activeSlide + 1}/{slides.length}
          </p>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: '1px',
              height: activeSlide === i ? '32px' : '12px',
              backgroundColor: slides[activeSlide].textColor,
              opacity: activeSlide === i ? 0.85 : 0.22,
              transition: 'height 0.55s cubic-bezier(0.4,0,0.2,1), opacity 0.55s, background-color 0.5s',
              borderRadius: '1px',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
function TypiqueSite() {
  const [scrolled, setScrolled] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('NOUVEAU');
  const [detailId, setDetailId] = useState(null);
  const [verification, setVerification] = useState(false); // dernière vérification du stock au clic sur « Commander »
  // Prix et tailles lus dans Shopify : 'chargement', 'ok' ou 'erreur'. Une lecture déjà faite par le chargement du fichier sert tout de suite.
  const [stock, setStock] = useState(() => _stockPrecedent ? { etat: 'ok', pieces: _stockPrecedent.pieces } : { etat: 'chargement', pieces: {} });
  const [legalModal, setLegalModal] = useState(null); // 'cgv' | 'mentions' | 'confidentialite' | 'livraison' | 'faq'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ---- DROP CONFIG ----
  // Dates, pièces en vente et identifiants Shopify viennent de reglage-drop.ini (lu par tools/build.py, variable DROP_REGLAGE).
  const DROP = { nom: DROP_REGLAGE.nom, start: new Date(DROP_REGLAGE.ouverture), end: new Date(DROP_REGLAGE.fermeture) };
  const now = maintenant();
  const dropStatus = now < DROP.start ? 'before' : now <= DROP.end ? 'active' : 'closed';

  // ---- COUNTDOWN ----
  // Le décompte vit dans <CountdownDigits> ; à son terme il force un re-rendu pour basculer le statut du drop.
  const [, setDropTick] = useState(0);
  const refreshDropStatus = () => setDropTick(t => t + 1);
  // L'horloge se recale sur le serveur après l'affichage : le statut du drop est alors recalculé.
  useEffect(() => (window.HORLOGE ? window.HORLOGE.surChangement(refreshDropStatus) : undefined), []);

  // ---- PRIX ET STOCK (Shopify) ----
  // Rend les pièces lues, ou null si Shopify ne répond pas. Une lecture ratée n'efface jamais une lecture réussie.
  const actualiserStock = () => lireStock().then(
    pieces => { setStock({ etat: 'ok', pieces }); return pieces; },
    () => { setStock(s => s.etat === 'ok' ? s : { etat: 'erreur', pieces: {} }); return null; }
  );
  useEffect(() => {
    actualiserStock();
    // Au retour sur l'onglet après un moment, des tailles ont pu partir.
    const auRetour = () => { if (!document.hidden && (!_stockPrecedent || Date.now() - _stockPrecedent.heure > 60000)) actualiserStock(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, []);
  // À l'ouverture du drop, le stock est relu.
  useEffect(() => { if (dropStatus === 'active') actualiserStock(); }, [dropStatus]);

  // ---- CART ----
  const addToCart = (product, size) => {
    setCartItems(prev => {
      const key = `${product.id}-${size}`;
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { key, product, size, qty: 1 }];
    });
    setCartOpen(true);
    loadShopifySdk().catch(() => {}); // pré-chargé pendant que le client regarde son panier
  };
  const removeFromCart = (key) => setCartItems(prev => prev.filter(i => i.key !== key));
  const updateQty = (key, delta) => setCartItems(prev =>
    prev.map(i => i.key === key ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)
  );
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  // ---- PRODUCTS ----
  // Toutes les pièces que le site connaît. Celles qui sont en vente, et celles de la « Nouvelle collection »,
  // se règlent dans reglage-drop.ini : rien à changer ici pour ouvrir, fermer ou retirer une pièce.
  const catalogue = [
    // Ordre d'affichage : t-shirts manches courtes, manches longues, Plein cagnard, hoodies, accessoires.
    // Dans chaque groupe, le Drop 02 passe avant le Drop 01.
    // Ni prix ni tailles ici : ils viennent de Shopify. Sans identifiant Shopify dans reglage-drop.ini, une pièce reste en « Bientôt disponible ».
    {
      id: 'ts-estaque', cat: 'T-SHIRTS',
      name: "L'Estaque",
      sizeNote: '100 % coton biologique peigné, 200 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#F7F6F3', label: 'Blanc' },
      desc: "Un chichi frégi à la main, le port devant soi : un dimanche à L'Estaque.",
      photos: [ESTAQUE_AVANT, ESTAQUE_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'ts-pinede', cat: 'T-SHIRTS',
      name: 'La Pinède',
      sizeNote: '100 % coton biologique peigné, 200 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#EDE8DF', label: 'Crème' },
      desc: "Vert olive et kaki clair, l'odeur de résine et l'ombre qu'on cherche à midi.",
      photos: [PINEDE_AVANT, PINEDE_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'ts-ferret', ref: 'TS 01', cat: 'T-SHIRTS',
      name: 'Le Ferret',
      sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
      color: { hex: '#3A3D44', label: 'Gris' },
      desc: "Le t-shirt en hommage au Cap, aux étés qui ne finissent pas, aux maisons avec tant de souvenirs qu\'on ne veut plus quitter.",
      photos: [FERRET_AVANT, FERRET_ARRIERE],
      mockup: <TshirtMockup bodyColor="#3A3D44" letterColor="#F4F1EC" letterStroke="#E39A7C" />, bg: '#E8E3DB'
    },
    {
      id: 'ts-entredeux', ref: 'TS 02', cat: 'T-SHIRTS',
      name: "L'Entre Deux",
      sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
      color: { hex: '#6B6F4A', label: 'Kaki' },
      desc: 'Neuf mots dans le dos. Garrigue, baïne, mistral, tchanquée. Tout ce qui fait typique, en une seule pièce.',
      mockup: <TshirtMockup bodyColor="#6B6F4A" letterColor="#F4F1EC" letterStroke="rgba(244,241,236,0.4)" />, bg: '#E0DDD3',
      photos: [ENTREDEUX_AVANT, ENTREDEUX_ARRIERE]
    },
    {
      id: 'ts-sable', ref: 'TS 03', cat: 'T-SHIRTS',
      name: 'Sable chaud',
      sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
      color: { hex: '#F7F6F3', label: 'Blanc' },
      desc: 'Le plus discret de la collection. Des vêtements simples et épurés, comme on aime.',
      photos: [SABLE_AVANT, SABLE_ARRIERE],
      mockup: <TshirtMockup bodyColor="#F7F6F3" letterColor="#E39A7C" letterStroke="rgba(227,154,124,0.3)" />, bg: '#EDE7DC'
    },
    {
      id: 'ts-soleilcouchant', cat: 'MANCHES LONGUES',
      name: 'Soleil couchant',
      sizeNote: '100 % coton biologique peigné, 180 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#5A2430', label: 'Bordeaux' },
      desc: "Bordeaux comme le ciel quand le soleil tombe, la dernière lumière de la journée dans le dos.",
      photos: [SOLEILCOUCHANT_AVANT, SOLEILCOUCHANT_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'ts-petitmatin', cat: 'MANCHES LONGUES',
      name: 'Petit matin',
      sizeNote: '100 % coton biologique peigné, 180 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#F7F6F3', label: 'Blanc' },
      desc: "Blanc comme la première lumière, avant que la plage se remplisse, avec un soleil jaune qui se lève dans le dos.",
      photos: [PETITMATIN_AVANT, PETITMATIN_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'sw-pleincagnard', cat: 'SWEATS',
      name: 'Plein cagnard',
      sizeNote: '50 % coton recyclé, 50 % coton biologique, 400 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#EDE8DF', label: 'Crème' },
      desc: "Plein cagnard : le soleil tape fort, l'ombre devient une affaire sérieuse et personne ne bouge.",
      photos: [PLEINCAGNARD_AVANT, PLEINCAGNARD_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'sw-minot', cat: 'SWEATS',
      name: 'Le Minot du Sud',
      sizeNote: '85 % coton biologique peigné, 15 % polyester recyclé, 300 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#2F2F31', label: 'Anthracite' },
      desc: "Minot, le gamin en marseillais, devenu grand mais toujours enfant du Sud.",
      photos: [MINOT_AVANT, MINOT_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'sw-corpssale', cat: 'SWEATS',
      name: 'Corps Salé Coeur Solaire',
      sizeNote: '85 % coton biologique peigné, 15 % polyester recyclé, 300 g/m² · Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#775855', label: 'Mocha' },
      desc: "Le sel sur la peau, le soleil dans le cœur, écrits en corail et en pêche sur fond mocha.",
      photos: [CORPSSALE_AVANT, CORPSSALE_ARRIERE], bg: '#E8E3DB'
    },
    {
      id: 'sw-mistral', ref: 'SW 01', cat: 'SWEATS',
      name: 'Le Mistral',
      sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#1A1A1A', label: 'Noir' },
      desc: "Après que le mistral est tout emporté, il ne reste que la simplicité et l'authenticité.",
      photos: [MISTRAL_AVANT, MISTRAL_ARRIERE],
      mockup: <HoodieMockup bodyColor="#1A2B5E" letterColor="#F4F1EC" />, bg: '#D8DCE8'
    },
    {
      id: 'sw-tchanquee', ref: 'SW 02', cat: 'SWEATS',
      name: 'La Tchanquée',
      sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#EDE8DF', label: 'Crème' },
      desc: "Comme une cabane tchanquée au coucher du soleil. Trois fois Typique pour les jours qui comptent triple sur le bassin.",
      photos: [TCHANQUEE_AVANT, TCHANQUEE_ARRIERE],
      mockup: <HoodieMockup bodyColor="#F4F1EC" letterColor="#0F2865" />, bg: '#E5DFD3'
    },
    {
      id: 'sw-surfer', ref: 'SW 03', cat: 'SWEATS',
      name: 'Le Surfer',
      sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
      color: { hex: '#0F1E36', label: 'Bleu nuit' },
      desc: "Bleu marine pour les matins de session, quand l'eau est encore froide et que personne n'a vu la lumière.",
      photos: [SURFER_AVANT, SURFER_ARRIERE],
      mockup: <HoodieMockup bodyColor="#0F2236" letterColor="#F4F1EC" />, bg: '#CDD2DE'
    },
    {
      id: 'acc-pilat', ref: 'ACC 01', cat: 'ACCESSOIRES',
      name: 'Le Pilat',
      color: { hex: '#2C2C2C', label: 'Noir washed', washed: true },
      desc: "Bob noir washed comme une dune au soleil rasant. Broderie typique, et basta.",
      photos: [BOB_PHOTO, PILAT_P1],
      mockup: <BobMockup bodyColor="#1F1F1F" labelColor="#F4F1EC" labelText="#E39A7C" />, bg: '#DDDAD5'
    },
    {
      id: 'acc-garrigue', ref: 'ACC 02', cat: 'ACCESSOIRES',
      name: 'La Garrigue',
      color: { hex: '#6B6F4A', label: 'Kaki' },
      desc: "Velours côtelé kaki comme un buisson de thym brûlé par le mois d'août.",
      photos: [CASQUETTE_PHOTO, GARRIGUE_P1, GARRIGUE_P2, GARRIGUE_P3],
      mockup: <CasquetteMockup bodyColor="#6B6F4A" labelColor="#F4F1EC" />, bg: '#DDE0D5'
    },
  ];

  // Pièces en vente : celles de reglage-drop.ini, dans l'ordre du catalogue ci-dessus.
  const nouvelles = new Set(DROP_REGLAGE.nouvelleCollection);
  const enVente = new Set([...DROP_REGLAGE.nouvelleCollection, ...DROP_REGLAGE.anciennesPieces]);
  // Chaque pièce reçoit ses tailles et leur prix depuis Shopify (stockEtat : 'aucun', 'chargement', 'erreur' ou 'ok').
  //  - sans identifiant Shopify, ou (nouvelle collection seulement) inconnue de Shopify : « Bientôt », sans prix ;
  //  - ancienne pièce inconnue de Shopify, ou pièce dont toutes les tailles sont épuisées : retirée de la boutique ;
  //  - pendant la lecture, ou si Shopify ne répond pas : aucun prix, aucun bouton d'achat.
  const products = catalogue.filter(p => enVente.has(p.id)).flatMap(p => {
    const nouveau = nouvelles.has(p.id);
    const base = { ...p, nouveau, sizes: [] };
    const num = SHOPIFY_IDS[p.id];
    if (!num) return [{ ...base, stockEtat: 'aucun' }];
    if (stock.etat !== 'ok') return [{ ...base, stockEtat: stock.etat }];
    const tailles = stock.pieces[num];
    if (!tailles) return nouveau ? [{ ...base, stockEtat: 'aucun' }] : [];
    if (!tailles.some(t => t.dispo)) return [];
    return [{ ...base, stockEtat: 'ok', sizes: tailles }];
  });

  // Panier : prix de Shopify au moment de l'affichage, et pièces devenues indisponibles repérées.
  const lignes = cartItems.map(item => {
    const t = tailleShopify(stock.pieces, item);
    return { ...item, priceNum: (t || item.product.sizes.find(s => s.label === item.size)).priceNum, epuise: stock.etat === 'ok' && !(t && t.dispo) };
  });
  const cartTotal = lignes.reduce((sum, i) => sum + i.priceNum * i.qty, 0);
  const detailProduct = products.find(p => p.id === detailId) || null;

  // Dernière vérification avant le paiement : une taille a pu partir pendant que le client choisissait.
  // Si Shopify ne répond pas, on laisse passer : sa page de paiement refuse elle-même une taille épuisée.
  const commander = async () => {
    setVerification(true);
    const pieces = await actualiserStock();
    setVerification(false);
    if (pieces && cartItems.some(item => { const t = tailleShopify(pieces, item); return !(t && t.dispo); })) return;
    setCartOpen(false);
    checkoutCartItems(cartItems);
  };

  const piecesDe = (cat) => cat === 'NOUVEAU' ? products.filter(p => p.nouveau) : products.filter(p => p.cat === cat);
  // Un onglet sans aucune pièce n'est pas affiché.
  const categories = ['NOUVEAU', 'T-SHIRTS', 'MANCHES LONGUES', 'SWEATS', 'ACCESSOIRES'].filter(cat => piecesDe(cat).length > 0);
  const categoryLabels = { 'NOUVEAU': 'NOUVELLE COLLECTION', 'T-SHIRTS': 'T-SHIRTS', 'MANCHES LONGUES': 'MANCHES LONGUES', 'SWEATS': 'HOODIES', 'ACCESSOIRES': 'ACCESSOIRES' };
  // Par défaut : la nouvelle collection seule (sinon le premier onglet). Les anciennes pièces apparaissent dans leur catégorie.
  const categorieActive = categories.includes(activeCategory) ? activeCategory : categories[0];
  const filteredProducts = piecesDe(categorieActive);

  const lexique = ['garrigue', 'baïne', 'mistral', 'tchanquée', 'restanque', 'cachotte', 'farigoule', 'la leyre'];

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: '#F4F1EC', color: '#0F2865' }}>
      {/* CART SIDEBAR */}
      {cartOpen && (
        <CartSidebar
          items={lignes}
          onClose={() => setCartOpen(false)}
          onRemove={removeFromCart}
          onUpdateQty={updateQty}
          total={cartTotal}
          cartCount={cartCount}
          onCheckout={commander}
          verification={verification}
        />
      )}

      {/* PRODUCT MODAL */}
      {detailProduct && (
        <ProductModal
          product={detailProduct}
          onClose={() => setDetailId(null)}
          onAddToCart={addToCart}
          dropStatus={dropStatus}
          onOpenAide={() => setLegalModal('livraison')}
          aideOuverte={!!legalModal}
        />
      )}

      {/* LEGAL MODAL */}
      {legalModal && (
        <LegalModal page={legalModal} onClose={() => setLegalModal(null)} />
      )}

      {/* ---------- STYLES GLOBAUX ---------- */}
      <style>{`
        :root {
          --navy: #0F2865;
          --navy-deep: #0A1F3D;
          --cream: #F4F1EC;
          --sand: #D7CFC2;
          --terracotta: #E39A7C;
          --terracotta-deep: #C77D60;
          --olive: #6B6F4A;
        }

        .font-typewriter { font-family: 'Special Elite', 'Courier Prime', monospace; }
        .font-american-tw { font-family: 'ITC American Typewriter', 'American Typewriter', 'Special Elite', 'Courier Prime', monospace; }
        .font-serif-fine { font-family: 'Cormorant', 'EB Garamond', serif; }
        .font-serif { font-family: 'EB Garamond', Georgia, serif; }

        /* Texture grain papier subtile */
        .grain::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.06;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
        }

        /* Indicateur de scroll */
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(8px); opacity: 1; }
        }
        .scroll-hint { animation: bounce-subtle 2.4s ease-in-out infinite; }

        /* Marquee vocabulaire */
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee { animation: marquee 60s linear infinite; }

        /* Underline animé */
        .link-under {
          position: relative;
          display: inline-block;
        }
        .link-under::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -3px;
          width: 100%;
          height: 1px;
          background: currentColor;
          transform-origin: right;
          transform: scaleX(1);
          transition: transform 600ms cubic-bezier(.2,.6,.2,1);
        }
        .link-under:hover::after {
          transform-origin: left;
          transform: scaleX(1);
          animation: underline-redraw 700ms cubic-bezier(.2,.6,.2,1);
        }
        @keyframes underline-redraw {
          0% { transform-origin: right; transform: scaleX(0); }
          50% { transform-origin: right; transform: scaleX(1); }
          50.01% { transform-origin: left; }
          100% { transform-origin: left; transform: scaleX(1); }
        }

        /* Hero title réveil */
        @keyframes title-rise {
          from { opacity: 0; transform: translateY(40px); letter-spacing: 0.15em; }
          to { opacity: 1; transform: translateY(0); letter-spacing: 0em; }
        }
        .hero-title {
          animation: title-rise 1800ms cubic-bezier(.2,.6,.2,1) 200ms both;
        }
        .hero-tagline {
          animation: title-rise 1800ms cubic-bezier(.2,.6,.2,1) 900ms both;
        }
        .hero-wave {
          animation: title-rise 1400ms cubic-bezier(.2,.6,.2,1) 700ms both;
        }

        /* Card hover */
        .product-card {
          transition: transform 600ms cubic-bezier(.2,.6,.2,1), box-shadow 600ms cubic-bezier(.2,.6,.2,1);
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          backface-visibility: hidden;
        }
        .product-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 30px 60px -30px rgba(15,40,101,0.35);
        }
        @media (max-width: 767px) {
          .product-card:hover { transform: translateZ(0) !important; box-shadow: none !important; }
          .product-card:active { transform: scale(0.98) !important; }
        }
        .product-cta {
          transition: gap 400ms ease, color 300ms ease;
        }
        .product-card:hover .product-arrow {
          transform: translateX(4px);
        }
        .product-arrow { transition: transform 400ms cubic-bezier(.2,.6,.2,1); }

        /* Bouton terracotta */
        .btn-terra {
          background: var(--terracotta);
          color: var(--cream);
          transition: background 300ms ease, transform 300ms cubic-bezier(.2,.6,.2,1);
          letter-spacing: 0.06em;
        }
        .btn-terra:hover {
          background: var(--terracotta-deep);
          transform: translateY(-1px);
        }

        /* Selection */
        ::selection { background: rgba(227,154,124,0.5); color: #0A1F3D; }

        /* Smooth scroll */
        html { scroll-behavior: smooth; }

        /* Showcase sticky — préfixe webkit pour iOS */
        .showcase-sticky {
          position: -webkit-sticky;
          position: sticky;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        /* 100vh = grande hauteur d'écran (barre iOS masquée) : stable, couvre tout l'écran.
           Le contenu est centré dans la petite hauteur (svh) pour rester visible barre affichée. */
        .showcase-track { height: 400vh; }
        .showcase-sticky { height: 100vh; }
        .showcase-content { height: 100vh; height: 100svh; }

        /* Curseur machine à écrire */
        @keyframes tw-blink {
          0%, 49% { opacity: 0.85; }
          50%, 100% { opacity: 0; }
        }

        /* Fix pour iOS scrolling */
        body { -webkit-text-size-adjust: 100%; }

        /* Cacher les scrollbars sur les conteneurs overflow-x */
        .overflow-x-auto::-webkit-scrollbar { display: none; }

        /* Input focus ring terracotta */
        input[type="email"]:focus { outline: none; border-color: rgba(227,154,124,0.6) !important; box-shadow: 0 0 0 2px rgba(227,154,124,0.15); }

        /* Réduit motion accessibilité */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* ---- MOBILE ---- */
        @media (max-width: 767px) {
          /* overflow-x: clip ne casse pas position:sticky sur Safari (contrairement à hidden) */
          body, #root { overflow-x: clip; }

          /* Hero tagline letter-spacing réduit */
          .hero-tagline { letter-spacing: 0.18em !important; font-size: 0.85rem !important; }

          /* Showcase labels mobile — grands mais sans débordement */
          .showcase-label-active  { font-size: clamp(3rem, 13vw, 5rem) !important; }
          .showcase-label-inactive { font-size: clamp(1.3rem, 5vw, 2rem) !important; }
          /* Supprimer la transition font-size sur mobile (cause tremblements) — garder seulement opacity */
          .showcase-label-active, .showcase-label-inactive {
            transition: opacity 0.4s ease !important;
            will-change: opacity;
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
          }

          /* Notre histoire padding réduit */
          .histoire-text { padding: 3rem 1.5rem !important; }

          /* Product card padding réduit */
          .product-card .p-6 { padding: 1rem !important; }

          /* Footer colonnes */
          .footer-col { padding-bottom: 2rem; }
        }
      `}</style>

      {/* ---------- NAV ---------- */}
      <nav
        className="fixed top-0 left-0 right-0 z-[9999] transition-all duration-500"
        style={{
          backgroundColor: scrolled || menuOpen ? 'rgba(244,241,236,0.97)' : 'transparent',
          backdropFilter: scrolled || menuOpen ? 'blur(8px)' : 'none',
          borderBottom: scrolled || menuOpen ? '1px solid rgba(15,40,101,0.08)' : '1px solid transparent'
        }}>

        <div className="max-w-7xl mx-auto px-6 md:px-10 py-5 flex items-center justify-between">
          <a
            href="#hero"
            onClick={() => { setMenuOpen(false); setCartOpen(false); setDetailId(null); }}
            className="font-typewriter text-xl md:text-2xl"
            style={{ color: scrolled || menuOpen ? '#0F2865' : '#F4F1EC' }}>
            typique
          </a>

          {/* Liens desktop */}
          <div
            className="hidden md:flex items-center gap-10 text-sm tracking-wider uppercase font-american-tw"
            style={{ color: scrolled ? '#0F2865' : '#F4F1EC' }}>
            <a href="#pieces" className="link-under">Boutique</a>
            <a href="#histoire" className="link-under">Notre histoire</a>
            <a href="#alertes" className="link-under">Alertes drops</a>
          </div>

          <div className="flex items-center gap-4">
            {/* Panier */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative font-typewriter text-xs md:text-sm tracking-widest uppercase flex items-center gap-2"
              style={{ color: scrolled || menuOpen ? '#E39A7C' : '#F4F1EC', background: 'none', border: 'none', cursor: 'pointer' }}>
              Panier
              {cartCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-typewriter"
                  style={{ backgroundColor: '#E39A7C', color: '#F4F1EC' }}>
                  {cartCount}
                </span>
              )}
            </button>

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden flex flex-col justify-center items-center gap-[5px] w-8 h-8"
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Menu">
              <span style={{
                display: 'block', width: '22px', height: '1.5px',
                backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
                transition: 'transform 0.3s, opacity 0.3s',
                transform: menuOpen ? 'translateY(6.5px) rotate(45deg)' : 'none',
              }} />
              <span style={{
                display: 'block', width: '22px', height: '1.5px',
                backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
                transition: 'opacity 0.2s',
                opacity: menuOpen ? 0 : 1,
              }} />
              <span style={{
                display: 'block', width: '22px', height: '1.5px',
                backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
                transition: 'transform 0.3s, opacity 0.3s',
                transform: menuOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none',
              }} />
            </button>
          </div>
        </div>

        {/* Menu mobile déroulant */}
        <div
          className="md:hidden overflow-hidden transition-all duration-300"
          style={{ maxHeight: menuOpen ? '280px' : '0px' }}>
          <div className="px-6 pb-6 pt-2 flex flex-col gap-5" style={{ borderTop: '1px solid rgba(15,40,101,0.08)' }}>
            {[['#pieces','Boutique'],['#histoire','Notre histoire'],['#alertes','Alertes drops']].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="font-typewriter text-sm tracking-[0.3em] uppercase"
                style={{ color: '#0F2865' }}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* ============================================================ */}
      {/* 1. HERO                                                      */}
      {/* ============================================================ */}
      <section id="hero" className="relative h-screen min-h-[640px] w-full overflow-hidden grain">
        <HeroScene />

        {/* Contenu hero centré */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center" style={{ color: '#F4F1EC' }}>
          <h1
            className="hero-title font-typewriter leading-none"
            style={{
              fontSize: 'clamp(5rem, 18vw, 13rem)',
              textShadow: '0 6px 40px rgba(10,31,61,0.4)',
              fontWeight: 400
            }}>
            
            typique
          </h1>

          <div className="hero-wave mt-8 md:mt-10">
            <WaveDivider color="#F4F1EC" width={260} strokeWidth={1.2} />
          </div>

          <p
            className="hero-tagline mt-6 md:mt-10 font-serif-fine italic"
            style={{
              fontSize: 'clamp(0.82rem, 3vw, 1.4rem)',
              letterSpacing: '0.4em',
              textTransform: 'lowercase',
              opacity: 0.95
            }}>
            
            entre sel et soleil
          </p>
        </div>

        {/* Indicateur de scroll — centré optiquement (compense le letter-spacing) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ bottom: '2.5rem' }}>
          
          <a
            href="#definition"
            className="scroll-hint flex flex-col items-center gap-2"
            style={{ color: '#F4F1EC' }}
            aria-label="Faire défiler">
            
            <span
              className="font-american-tw text-xs uppercase"
              style={{
                letterSpacing: '0.35em',
                paddingLeft: '0.35em', /* compensation optique du letter-spacing */
                opacity: 0.85
              }}>
              
              Découvrir
            </span>
            <ChevronDown size={18} strokeWidth={1.2} />
          </a>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. DÉFINITION DICTIONNAIRE                                    */}
      {/* ============================================================ */}
      <DefinitionSection />


      {/* ============================================================ */}
      {/* 3. BOUTIQUE SHOWCASE — sticky scroll                          */}
      {/* ============================================================ */}
      <BoutiqueShowcase onSelectCategory={setActiveCategory} />

      {/* ============================================================ */}
      {/* 4b. BOUTIQUE GRID                                             */}
      {/* ============================================================ */}
      <section id="pieces" className="relative py-24 md:py-36 px-6" style={{ backgroundColor: '#F4F1EC' }}>
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="font-serif-fine italic" style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0F2865', letterSpacing: '0.02em' }}>
                La nouvelle collection
              </h2>
              <p className="font-serif mt-4 text-base md:text-lg max-w-md mx-auto" style={{ color: '#0F2865', opacity: 0.65 }}>
                Toutes oversize. Toutes brodées. Toutes pensées entre deux côtes.
              </p>
            </div>
          </Reveal>

          {/* DROP BANNER */}
          <Reveal>
            <div className="mb-12 py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ border: '1px solid rgba(15,40,101,0.12)', borderRadius: '2px', backgroundColor: dropStatus === 'active' ? 'rgba(227,154,124,0.08)' : 'rgba(15,40,101,0.04)' }}>
              {dropStatus === 'before' && (
                <>
                  <div>
                    <p className="font-typewriter text-xs tracking-[0.3em] uppercase mb-1" style={{ color: '#E39A7C' }}>{DROP.nom} · ouverture {DROP_REGLAGE.ouvertureTexte}</p>
                    <p className="font-serif text-sm mb-2" style={{ opacity: 0.7 }}>Les commandes ouvrent dans</p>
                    <a
                      href="#alertes"
                      className="font-typewriter text-[10px] tracking-[0.2em] uppercase link-under"
                      style={{ color: '#E39A7C', opacity: 0.75 }}>
                      Recevoir l'alerte →
                    </a>
                  </div>
                  <CountdownDigits target={DROP.start} color="#0F2865" onExpire={refreshDropStatus} />
                </>
              )}
              {dropStatus === 'active' && (
                <>
                  <div>
                    <p className="font-typewriter text-xs tracking-[0.3em] uppercase mb-1" style={{ color: '#E39A7C' }}>● {DROP.nom} ouvert</p>
                    <p className="font-serif text-sm" style={{ opacity: 0.7 }}>Fermeture des commandes {DROP_REGLAGE.fermetureTexte}</p>
                  </div>
                  <CountdownDigits target={DROP.end} color="#E39A7C" onExpire={refreshDropStatus} />
                </>
              )}
              {dropStatus === 'closed' && (
                <p className="font-serif italic text-sm w-full text-center" style={{ opacity: 0.6 }}>Prochain drop à venir.</p>
              )}
            </div>
          </Reveal>

          {/* SHOPIFY NE RÉPOND PAS : pas de prix, pas de bouton d'achat */}
          {stock.etat === 'erreur' && (
            <div role="status" className="mb-12 py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ border: '1px solid rgba(227,154,124,0.55)', borderRadius: '2px', backgroundColor: 'rgba(227,154,124,0.08)' }}>
              <div>
                <p className="font-typewriter text-xs tracking-[0.3em] uppercase mb-1" style={{ color: '#E39A7C' }}>Prix et tailles non chargés</p>
                <p className="font-serif text-sm" style={{ opacity: 0.7 }}>Vérifie ta connexion, puis réessaie. Aucun achat n'est possible tant que ça ne charge pas.</p>
              </div>
              <button
                onClick={() => { setStock({ etat: 'chargement', pieces: {} }); actualiserStock(); }}
                className="font-typewriter text-xs tracking-wider uppercase px-4 py-2.5"
                style={{ borderRadius: '2px', backgroundColor: '#E39A7C', color: '#F4F1EC', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Réessayer
              </button>
            </div>
          )}

          {/* CATEGORY TABS */}
          <Reveal>
            <div className="flex gap-1 mb-12 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="font-typewriter text-xs tracking-[0.3em] uppercase px-5 py-2.5 whitespace-nowrap transition-all duration-300"
                  style={{
                    borderRadius: '2px',
                    border: '1px solid',
                    borderColor: categorieActive === cat ? '#0F2865' : 'rgba(15,40,101,0.18)',
                    backgroundColor: categorieActive === cat ? '#0F2865' : 'transparent',
                    color: categorieActive === cat ? '#F4F1EC' : 'rgba(15,40,101,0.55)',
                    cursor: 'pointer'
                  }}>
                  {categoryLabels[cat] || cat}
                </button>
              ))}
            </div>
          </Reveal>

          {/* PRODUCT GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((p, i) => (
              <Reveal key={p.id} delay={i * 80}>
                <ProductCard
                  product={p}
                  onAddToCart={addToCart}
                  dropStatus={dropStatus}
                  onOpenDetail={(piece) => setDetailId(piece.id)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. ENTRE SEL ET SOLEIL                                        */}
      {/* ============================================================ */}
      <section id="histoire" className="relative grain" style={{ backgroundColor: '#0F2865', color: '#F4F1EC' }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[640px]">
          {/* Image cabane tchanquée */}
          <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[640px] order-1 lg:order-1 overflow-hidden">
            <CabaneTchanqueeScene />
            {/* Légende façon polaroid */}
            <div
              className="absolute bottom-6 left-6 md:bottom-8 md:left-8 px-3 py-1.5"
              style={{
                backgroundColor: 'rgba(244,241,236,0.92)',
                color: '#0F2865'
              }}>
              
              <p className="font-typewriter text-[10px] md:text-xs tracking-[0.2em]">
                BASSIN D'ARCACHON · ÉTÉ 25
              </p>
            </div>
          </div>

          {/* Texte */}
          <div className="histoire-text flex items-center order-2 lg:order-2 px-8 md:px-16 lg:px-20 py-14 md:py-20 lg:py-32">
            <Reveal>
              <div className="max-w-xl">
                <h2
                  className="font-serif-fine italic mb-10"
                  style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.8rem)', lineHeight: 1.2 }}>
                  
                  Une histoire de pont.
                </h2>

                <div className="font-serif text-base md:text-lg space-y-6 leading-relaxed" style={{ opacity: 0.88 }}>
                  <p>
                    Typique est née entre deux côtes. D'un côté, les Bouches-du-Rhône : le mistral, la
                    garrigue, les calanques. De l'autre, le bassin d'Arcachon : les cabanes tchanquées, les
                    pins, les vagues longues d'Hossegor.
                  </p>
                  <p>
                    Au milieu, des amis, un été, une maison, et un mot qui revenait sans cesse dans la
                    bouche de chacun&nbsp;: <span className="font-typewriter" style={{ fontStyle: 'normal' }}>typique</span>.
                  </p>
                </div>

                <div className="mt-10">
                  <p className="font-serif-fine italic text-lg" style={{ color: '#E39A7C' }}>
                    Deux côtes. Une seule évidence.
                  </p>
                </div>

                <div className="mt-12 opacity-60">
                  <p className="font-typewriter text-[10px] tracking-[0.3em] uppercase">
                    Les Calanques · Les Landes
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. MARQUEE LEXIQUE                                            */}
      {/* ============================================================ */}
      <section
        className="relative py-8 overflow-hidden"
        style={{ backgroundColor: '#F4F1EC', borderTop: '1px solid rgba(15,40,101,0.08)', borderBottom: '1px solid rgba(15,40,101,0.08)' }}
        aria-hidden="true">
        
        <div className="flex animate-marquee whitespace-nowrap" style={{ width: 'max-content' }}>
          {[...lexique, ...lexique, ...lexique, ...lexique].map((mot, i) =>
          <span
            key={i}
            className="font-serif-fine italic mx-8 md:mx-14 text-2xl md:text-3xl"
            style={{ color: i % 4 === 0 ? '#E39A7C' : '#0F2865', opacity: i % 4 === 0 ? 0.9 : 0.55 }}>
            
              {mot} <span style={{ opacity: 0.4 }}>·</span>
            </span>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. PRÉCOMMANDES                                               */}
      {/* ============================================================ */}
      <section id="alertes" className="relative py-28 md:py-40 px-6 grain" style={{ backgroundColor: '#0F2865', color: '#F4F1EC' }}>
        <div className="max-w-2xl mx-auto text-center">
          <Reveal>
            <h2 className="font-serif-fine italic leading-tight mb-6" style={{ fontSize: 'clamp(2rem,4.5vw,3.4rem)', color: '#F4F1EC' }}>
              Ne rate pas<br />le prochain drop.
            </h2>
            <p className="font-serif text-base md:text-lg leading-relaxed mb-10" style={{ opacity: 0.65, textWrap: 'balance' }}>
              Chaque drop dure quelques jours. Les pièces partent vite.{' '}
              Suis-nous sur Instagram pour ne rien rater.
            </p>
            <div className="mb-10 flex justify-center">
              <WaveDivider color="#F4F1EC" width={120} strokeWidth={1} />
            </div>
            <a
              href="https://www.instagram.com/typique.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-terra inline-block px-6 py-3.5 font-typewriter text-xs tracking-widest uppercase whitespace-nowrap"
              style={{ borderRadius: '2px' }}>
              Suivre @typique.fr →
            </a>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. FOOTER                                                     */}
      {/* ============================================================ */}
      <footer className="relative py-20 md:py-24 px-6 grain" style={{ backgroundColor: '#0A1F3D', color: '#F4F1EC' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-10">
            {/* Colonne 1 — Logo */}
            <div>
              <p className="font-typewriter text-3xl mb-3">typique</p>
              <p className="font-serif-fine italic text-base mb-8" style={{ opacity: 0.7 }}>
                entre sel et soleil
              </p>
            </div>

            {/* Colonne 2 — Navigation */}
            <div>
              <p className="font-typewriter text-xs tracking-[0.35em] uppercase mb-6" style={{ opacity: 0.55 }}>
                Naviguer
              </p>
              <ul className="space-y-3 font-serif text-base">
                <li><a href="#pieces" className="link-under">Boutique</a></li>
                <li><a href="#histoire" className="link-under">Notre histoire</a></li>
                <li><a href="#alertes" className="link-under">Alertes drops</a></li>
                <li><button onClick={() => setLegalModal('livraison')} className="link-under font-serif text-base" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>Livraison et retours</button></li>
                <li><button onClick={() => setLegalModal('faq')} className="link-under font-serif text-base" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>FAQ</button></li>
                <li><button onClick={() => setLegalModal('mentions')} className="link-under font-serif text-base" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.7 }}>Mentions légales</button></li>
                <li><button onClick={() => setLegalModal('cgv')} className="link-under font-serif text-base" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.7 }}>CGV</button></li>
                <li><button onClick={() => setLegalModal('confidentialite')} className="link-under font-serif text-base" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.7 }}>Confidentialité</button></li>
              </ul>
            </div>

            {/* Colonne 3 — Contact */}
            <div>
              <p className="font-typewriter text-xs tracking-[0.35em] uppercase mb-6" style={{ opacity: 0.55 }}>
                Suivre
              </p>
              <ul className="space-y-4">
                <li>
                  <a
                    href="https://www.instagram.com/typique.fr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 font-serif text-base link-under">
                    
                    <Instagram size={16} strokeWidth={1.5} />
                    @typique.fr
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${EMAIL_CONTACT}`}
                    className="inline-flex items-center gap-3 font-serif text-base link-under">
                    
                    <Mail size={16} strokeWidth={1.5} />
                    {EMAIL_CONTACT}
                  </a>
                </li>
              </ul>

              <div className="mt-10 max-w-xs">
                <p className="font-serif-fine italic text-sm leading-relaxed" style={{ opacity: 0.6 }}>
                  Marque française indépendante.<br />
                  Pièces produites en série limitée<br />entre les Calanques et les Landes.
                </p>
              </div>
            </div>
          </div>

          {/* Trait + copyright */}
          <div
            className="mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ borderTop: '1px solid rgba(244,241,236,0.12)' }}>
            
            <p className="font-typewriter text-xs tracking-[0.25em]" style={{ opacity: 0.6 }}>
              © typique 2026 · entre sel et soleil
            </p>
            <p className="font-serif-fine italic text-xs" style={{ opacity: 0.5 }}>
              [tchipik], à la provençale.
            </p>
          </div>
        </div>
      </footer>
    </div>);

}

// ---------- Mount ----------
// /apercu/ : la boutique s'affiche tout de suite. Accueil (index.html) : la page d'accueil charge ce fichier à l'avance,
// puis appelle TYPIQUE_BOUTIQUE.monter() à l'heure d'ouverture et .demonter() à la fermeture.
let root = null;
function monterBoutique() {
  if (root) return;
  root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<TypiqueSite />);

  // Cacher l'écran de chargement une fois React monté
  var el = document.getElementById('loading-screen');
  if (el) {
    el.classList.add('hide');
    setTimeout(function() { el.style.display = 'none'; }, 700);
  }
}
function demonterBoutique() {
  if (!root) return;
  root.unmount();
  root = null;
  document.body.style.overflow = '';
}
if (window.TYPIQUE_ACCUEIL) window.TYPIQUE_BOUTIQUE = { monter: monterBoutique, demonter: demonterBoutique };
else monterBoutique();