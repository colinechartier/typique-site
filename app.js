var ACCESSOIRES_SHOWCASE='/photos/accessoires_showcase.webp?v=b00d0b4272';
var BOB_PHOTO='/photos/bob_photo.webp?v=ed84152aac';
var CASQUETTE_PHOTO='/photos/casquette_photo.webp?v=dddbba4b5d';
var ENTREDEUX_ARRIERE='/photos/entredeux_arriere.webp?v=6cb4dd775f';
var ENTREDEUX_AVANT='/photos/entredeux_avant.webp?v=1a6be5ba6f';
var ENTREDEUX_P3='/photos/entredeux_p3.webp?v=c8fd3a267a';
var ENTREDEUX_P4='/photos/entredeux_p4.webp?v=45fa2fe165';
var FERRET_ARRIERE='/photos/ferret_arriere.webp?v=874864fc64';
var FERRET_AVANT='/photos/ferret_avant.webp?v=e5e7ecb460';
var FERRET_P1='/photos/ferret_p1.webp?v=94a539e143';
var FERRET_P2='/photos/ferret_p2.webp?v=8d5e2cd14c';
var FERRET_P3='/photos/ferret_p3.webp?v=ac8c8ed5b4';
var FERRET_P4='/photos/ferret_p4.webp?v=1ca2dfe72f';
var GARRIGUE_P1='/photos/garrigue_p1.webp?v=46392dcfbe';
var GARRIGUE_P2='/photos/garrigue_p2.webp?v=36d1541475';
var GARRIGUE_P3='/photos/garrigue_p3.webp?v=2a7800495d';
var HOODIES_SHOWCASE='/photos/hoodies_showcase.webp?v=f3ba3e4846';
var MISTRAL_AVANT='/photos/mistral_avant.webp?v=ac188c6d12';
var MISTRAL_R2='/photos/mistral_r2.webp?v=7207ebed22';
var MISTRAL_R3='/photos/mistral_r3.webp?v=883da9cde9';
var PILAT_P1='/photos/pilat_p1.webp?v=91fdedc455';
var SABLE_NOUVEAU='/photos/sable_nouveau.webp?v=663920bc3c';
var SABLE_P1='/photos/sable_p1.webp?v=e3518a79eb';
var SABLE_P2='/photos/sable_p2.webp?v=5e840cd91f';
var SABLE_P3='/photos/sable_p3.webp?v=4cefaf6c91';
var SURFER_ARRIERE='/photos/surfer_arriere.webp?v=310b91c5e3';
var SURFER_AVANT='/photos/surfer_avant.webp?v=d2ce8d9533';
var SURFER_R1='/photos/surfer_r1.webp?v=ed0e700b68';
var SURFER_R2='/photos/surfer_r2.webp?v=811d5257ba';
var SURFER_R3='/photos/surfer_r3.webp?v=7906218f6c';
var SURFER_R4='/photos/surfer_r4.webp?v=91cbd50503';
var TCHANQUEE_ARRIERE='/photos/tchanquee_arriere.webp?v=5b0410ff0a';
var TCHANQUEE_AVANT='/photos/tchanquee_avant.webp?v=dd3aa5db0d';
var TCHANQUEE_P1='/photos/tchanquee_p1.webp?v=16d91046ab';
var TCHANQUEE_P2='/photos/tchanquee_p2.webp?v=90c5c2451b';
var TCHANQUEE_P3='/photos/tchanquee_p3.webp?v=7e9035898f';
var TSHIRT_SHOWCASE='/photos/tshirt_showcase.webp?v=877a829552';
var WAVE_DIVIDER='/photos/wave_divider.png?v=73e425ea9e';
var HERO_540='/media/hero-540.mp4?v=6a669a2ca7';
var HERO_720='/media/hero-720.mp4?v=e86924ff66';
var HERO_POSTER='/media/hero-poster.webp?v=a546545392';
const {
  useState,
  useEffect,
  useRef
} = React;

// ============================================================
// SHOPIFY — intégration Buy SDK
// ============================================================
const SHOPIFY_DOMAIN = 'idkwvs-tc.myshopify.com';
const SHOPIFY_TOKEN = '76444f16fa7cea3e4d681c0f6e8a3189';
const SHOPIFY_IDS = {
  'ts-ferret': '15770490175872',
  'ts-entredeux': '15770490962304',
  'ts-sable': '15770491683200',
  'sw-mistral': '15770492764544',
  'sw-tchanquee': '15770493616512',
  'sw-surfer': '15770494566784',
  'acc-pilat': '15778216706432',
  'acc-garrigue': '15778220343680'
};

// Le SDK n'est chargé qu'à l'ajout au panier : il ne ralentit plus l'ouverture du site.
const SHOPIFY_SDK_URL = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
let _sdkPromise = null;
function loadShopifySdk() {
  if (window.ShopifyBuy) return Promise.resolve();
  if (!_sdkPromise) {
    _sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHOPIFY_SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        _sdkPromise = null;
        reject(new Error('SDK Shopify indisponible'));
      };
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
      storefrontAccessToken: SHOPIFY_TOKEN
    });
  }
  return _shopifyClient;
}

// Le site affiche « XXL », Shopify nomme la variante « 2XL ».
const SIZE_ALIASES = {
  XXL: '2XL'
};

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
  if (!client) {
    alert("Erreur : SDK Shopify non chargé.");
    return;
  }
  const gid = `gid://shopify/Product/${productNumId}`;
  const product = await client.product.fetch(gid);
  const variant = findVariant(product, sizeName);
  const checkout = await client.checkout.create({
    lineItems: [{
      variantId: variant.id,
      quantity: 1
    }]
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
    if (!client) {
      alert("Erreur : SDK Shopify non chargé.");
      return;
    }
    const lineItems = [];
    for (const item of cartItems) {
      const productNumId = SHOPIFY_IDS[item.product.id];
      if (!productNumId) continue;
      const gid = `gid://shopify/Product/${productNumId}`;
      const product = await client.product.fetch(gid);
      const variant = findVariant(product, item.size);
      lineItems.push({
        variantId: variant.id,
        quantity: item.qty
      });
    }
    const checkout = await client.checkout.create({
      lineItems
    });
    const returnUrl = 'https://www.boutiquetypique.fr';
    const checkoutUrl = new URL(checkout.webUrl);
    checkoutUrl.searchParams.set('return_to', returnUrl);
    window.location.href = checkoutUrl.toString();
  } catch (e) {
    alert(`Impossible d'ouvrir le paiement (${e.message}). Réessaie dans un instant ou écris-nous.`);
  }
}

// ---------- Icônes inline (remplace lucide-react en mode standalone) ----------
const Icon = ({
  children,
  size = 24,
  strokeWidth = 1.5,
  className = '',
  style = {}
}) => /*#__PURE__*/React.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: strokeWidth,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: className,
  style: style,
  "aria-hidden": "true"
}, children);
const ChevronDown = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("polyline", {
  points: "6 9 12 15 18 9"
}));
const ArrowRight = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("line", {
  x1: "5",
  y1: "12",
  x2: "19",
  y2: "12"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "12 5 19 12 12 19"
}));
const ArrowUpRight = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("line", {
  x1: "7",
  y1: "17",
  x2: "17",
  y2: "7"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "7 7 17 7 17 17"
}));
const Mail = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "4",
  width: "20",
  height: "16",
  rx: "2"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "2 6 12 13 22 6"
}));
const Instagram = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "20",
  height: "20",
  rx: "5"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "4"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "17.5",
  cy: "6.5",
  r: "0.6",
  fill: "currentColor"
}));

// ---------- Custom hook : apparition au scroll ----------
function useInView(options = {
  threshold: 0.15
}) {
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
function Typewriter({
  text,
  start,
  speed = 85,
  onDone,
  showCursor = false,
  instant = false
}) {
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
    const t = setTimeout(() => setCount(c => c + 1), speed);
    return () => clearTimeout(t);
  }, [start, count, text, speed, onDone, instant]);
  return /*#__PURE__*/React.createElement(React.Fragment, null, text.slice(0, count), showCursor && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-block',
      width: '0.5ch',
      marginLeft: '0.05em',
      animation: 'tw-blink 900ms steps(2, start) infinite',
      color: 'currentColor',
      opacity: 0.85
    }
  }, "|"));
}

// ---------- Composant Reveal ----------
function Reveal({
  children,
  delay = 0,
  className = ''
}) {
  const [ref, inView] = useInView();
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: className,
    style: {
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 1100ms cubic-bezier(.2,.6,.2,1) ${delay}ms, transform 1100ms cubic-bezier(.2,.6,.2,1) ${delay}ms`
    }
  }, children);
}

// ---------- Compte à rebours ----------
// Isolé dans son propre composant : seul lui se redessine chaque seconde, pas tout le site.
function CountdownDigits({
  target,
  color,
  onExpire
}) {
  const calc = () => {
    const diff = target - new Date();
    if (diff <= 0) return null;
    return {
      j: Math.floor(diff / 86400000),
      h: Math.floor(diff % 86400000 / 3600000),
      m: Math.floor(diff % 3600000 / 60000),
      s: Math.floor(diff % 60000 / 1000)
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
  return /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4"
  }, [['j', 'jours'], ['h', 'heures'], ['m', 'min'], ['s', 'sec']].map(([k, label]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-2xl md:text-3xl",
    style: {
      color
    }
  }, String(left[k] ?? 0).padStart(2, '0')), /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[9px] tracking-[0.2em] uppercase",
    style: {
      opacity: 0.45
    }
  }, label))));
}

// ---------- Vague décorative (image hand-drawn) ----------
// Utilise vague-ref.png en cream sur fond transparent, recolorée via mask pour suivre la prop `color`
function WaveDivider({
  color = '#F4F1EC',
  width = 220,
  strokeWidth = 1.4
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-block',
      width: width,
      height: Math.round(width * 0.135),
      // ratio 744:113 ≈ 0.152, légèrement réduit
      backgroundColor: color,
      WebkitMaskImage: `url(${WAVE_DIVIDER})`,
      maskImage: `url(${WAVE_DIVIDER})`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskPosition: 'center',
      maskPosition: 'center'
    }
  });
}

// ---------- Mockups produits SVG ----------

// T-shirt avec bubble letters TYPIQUE au dos
function TshirtMockup({
  bodyColor = '#3A3A3A',
  letterColor = '#F4F1EC',
  letterStroke = '#E39A7C'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 300",
    className: "w-full h-full"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M55 75 L95 55 L110 60 Q150 50 190 60 L205 55 L245 75 L235 130 L210 122 L210 260 L90 260 L90 122 L65 130 Z",
    fill: bodyColor
  }), /*#__PURE__*/React.createElement("path", {
    d: "M115 60 Q150 75 185 60",
    stroke: bodyColor,
    strokeWidth: "2",
    fill: "none",
    opacity: "0.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M105 130 Q110 180 105 230",
    stroke: "rgba(0,0,0,0.15)",
    strokeWidth: "1",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M195 130 Q190 180 195 230",
    stroke: "rgba(0,0,0,0.15)",
    strokeWidth: "1",
    fill: "none"
  }), /*#__PURE__*/React.createElement("g", {
    transform: "translate(150 195)",
    textAnchor: "middle"
  }, /*#__PURE__*/React.createElement("text", {
    fontFamily: "'Special Elite', monospace",
    fontWeight: "700",
    fontSize: "34",
    fill: letterColor,
    stroke: letterStroke,
    strokeWidth: "1.2",
    letterSpacing: "2",
    style: {
      paintOrder: 'stroke fill'
    }
  }, "TYPIQUE")));
}

// Hoodie crème avec triple TYPIQUE bubble letters
function HoodieMockup({
  bodyColor = '#F4F1EC',
  letterColor = '#0F2865'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 300",
    className: "w-full h-full"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M115 50 Q150 30 185 50 L195 75 Q150 65 105 75 Z",
    fill: bodyColor,
    stroke: "rgba(0,0,0,0.08)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M50 90 L100 70 L105 75 Q150 65 195 75 L200 70 L250 90 L240 145 L215 138 L215 270 L85 270 L85 138 L60 145 Z",
    fill: bodyColor,
    stroke: "rgba(0,0,0,0.06)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M85 145 Q90 200 85 270",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "1",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M215 145 Q210 200 215 270",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "1",
    fill: "none"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "140",
    y1: "68",
    x2: "138",
    y2: "92",
    stroke: "#0F2865",
    strokeWidth: "1.5",
    opacity: "0.4"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "160",
    y1: "68",
    x2: "162",
    y2: "92",
    stroke: "#0F2865",
    strokeWidth: "1.5",
    opacity: "0.4"
  }), /*#__PURE__*/React.createElement("g", {
    textAnchor: "middle",
    fontFamily: "'Special Elite', monospace",
    fontWeight: "700",
    letterSpacing: "1.5"
  }, /*#__PURE__*/React.createElement("text", {
    x: "150",
    y: "170",
    fontSize: "22",
    fill: letterColor
  }, "TYPIQUE"), /*#__PURE__*/React.createElement("text", {
    x: "150",
    y: "200",
    fontSize: "22",
    fill: letterColor
  }, "TYPIQUE"), /*#__PURE__*/React.createElement("text", {
    x: "150",
    y: "230",
    fontSize: "22",
    fill: letterColor
  }, "TYPIQUE")), /*#__PURE__*/React.createElement("line", {
    x1: "85",
    y1: "262",
    x2: "215",
    y2: "262",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "1"
  }));
}

// Bob washed avec étiquette tissée
function BobMockup({
  bodyColor = '#1F1F1F',
  labelColor = '#F4F1EC',
  labelText = '#E39A7C'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 300",
    className: "w-full h-full"
  }, /*#__PURE__*/React.createElement("ellipse", {
    cx: "150",
    cy: "200",
    rx: "120",
    ry: "22",
    fill: bodyColor
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "150",
    cy: "195",
    rx: "120",
    ry: "22",
    fill: "rgba(255,255,255,0.06)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M55 198 Q55 110 150 100 Q245 110 245 198",
    fill: bodyColor
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "100",
    cy: "140",
    rx: "35",
    ry: "15",
    fill: "rgba(255,255,255,0.04)"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "190",
    cy: "160",
    rx: "40",
    ry: "18",
    fill: "rgba(255,255,255,0.05)"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "150",
    cy: "120",
    rx: "50",
    ry: "10",
    fill: "rgba(255,255,255,0.06)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M55 195 Q150 188 245 195",
    stroke: "rgba(255,255,255,0.15)",
    strokeWidth: "1",
    fill: "none",
    strokeDasharray: "3 4"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "123",
    y: "142",
    width: "54",
    height: "22",
    rx: "2",
    fill: labelColor
  }), /*#__PURE__*/React.createElement("text", {
    x: "150",
    y: "158",
    textAnchor: "middle",
    fontFamily: "'Special Elite', monospace",
    fontSize: "14",
    fill: labelText
  }, "typique"));
}
function CasquetteMockup({
  bodyColor = '#6B6F4A',
  labelColor = '#F4F1EC'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 300",
    className: "w-full h-full"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M78 192 Q150 204 258 186 L254 200 Q150 218 73 206 Z",
    fill: bodyColor,
    stroke: "rgba(0,0,0,0.18)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M83 194 Q150 206 253 189",
    stroke: "rgba(255,255,255,0.12)",
    strokeWidth: "0.8",
    fill: "none",
    strokeDasharray: "4 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M98 192 Q76 138 108 97 Q150 72 192 97 Q224 138 202 192",
    fill: bodyColor
  }), /*#__PURE__*/React.createElement("path", {
    d: "M150 83 L150 192",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "0.8",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M108 97 Q128 142 128 192",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "0.8",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M192 97 Q172 142 172 192",
    stroke: "rgba(0,0,0,0.1)",
    strokeWidth: "0.8",
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "150",
    cy: "84",
    r: "7",
    fill: bodyColor,
    stroke: "rgba(0,0,0,0.18)",
    strokeWidth: "1"
  }), [102, 112, 122, 132, 142, 152, 162, 172, 182, 192].map((x, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: x,
    y1: "98",
    x2: x - 4,
    y2: "192",
    stroke: "rgba(255,255,255,0.04)",
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("text", {
    x: "150",
    y: "158",
    textAnchor: "middle",
    fontFamily: "'Special Elite',monospace",
    fontSize: "13",
    fill: labelColor,
    letterSpacing: "1.5",
    opacity: "0.9"
  }, "typique"), /*#__PURE__*/React.createElement("rect", {
    x: "128",
    y: "198",
    width: "44",
    height: "9",
    rx: "2",
    fill: bodyColor,
    stroke: "rgba(0,0,0,0.15)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "143",
    y: "199.5",
    width: "14",
    height: "6",
    rx: "1",
    fill: labelColor,
    opacity: "0.55"
  }));
}

// ---------- Cabane tchanquée SVG (section "entre sel et soleil") ----------
function CabaneTchanqueeScene() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 600 700",
    className: "w-full h-full",
    preserveAspectRatio: "xMidYMid slice"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "sky",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#0F2865"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "35%",
    stopColor: "#3A2C5C"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "65%",
    stopColor: "#9B5B5C"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "85%",
    stopColor: "#E39A7C"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#F4D9B8"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "water",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#7A4A52"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "50%",
    stopColor: "#3A2845"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#0F2865"
  })), /*#__PURE__*/React.createElement("radialGradient", {
    id: "sun",
    cx: "0.5",
    cy: "0.5",
    r: "0.5"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#FBE3C2"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "50%",
    stopColor: "#E39A7C",
    stopOpacity: "0.85"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#E39A7C",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("rect", {
    width: "600",
    height: "700",
    fill: "url(#sky)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "380",
    cy: "400",
    r: "180",
    fill: "url(#sun)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "380",
    cy: "400",
    r: "42",
    fill: "#FBE3C2",
    opacity: "0.95"
  }), /*#__PURE__*/React.createElement("rect", {
    y: "430",
    width: "600",
    height: "270",
    fill: "url(#water)"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "445",
    rx: "60",
    ry: "6",
    fill: "#FBE3C2",
    opacity: "0.7"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "465",
    rx: "50",
    ry: "3",
    fill: "#E39A7C",
    opacity: "0.5"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "485",
    rx: "40",
    ry: "2",
    fill: "#E39A7C",
    opacity: "0.35"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "505",
    rx: "35",
    ry: "2",
    fill: "#E39A7C",
    opacity: "0.25"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "525",
    rx: "28",
    ry: "1.5",
    fill: "#E39A7C",
    opacity: "0.18"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "380",
    cy: "545",
    rx: "22",
    ry: "1.2",
    fill: "#E39A7C",
    opacity: "0.12"
  }), /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
    x: "155",
    y: "370",
    width: "6",
    height: "280",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "195",
    y: "370",
    width: "6",
    height: "280",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "235",
    y: "370",
    width: "6",
    height: "280",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "275",
    y: "370",
    width: "6",
    height: "280",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "155",
    y1: "500",
    x2: "201",
    y2: "450",
    stroke: "#1A1208",
    strokeWidth: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "201",
    y1: "500",
    x2: "155",
    y2: "450",
    stroke: "#1A1208",
    strokeWidth: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "235",
    y1: "500",
    x2: "281",
    y2: "450",
    stroke: "#1A1208",
    strokeWidth: "3"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "281",
    y1: "500",
    x2: "235",
    y2: "450",
    stroke: "#1A1208",
    strokeWidth: "3"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "140",
    y: "365",
    width: "160",
    height: "8",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "155",
    y: "290",
    width: "130",
    height: "80",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "145,290 220,250 295,290",
    fill: "#0A0804"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "200",
    y: "310",
    width: "22",
    height: "22",
    fill: "#FBE3C2",
    opacity: "0.85"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "211",
    y1: "310",
    x2: "211",
    y2: "332",
    stroke: "#1A1208",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "200",
    y1: "321",
    x2: "222",
    y2: "321",
    stroke: "#1A1208",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "180",
    y1: "370",
    x2: "172",
    y2: "640",
    stroke: "#1A1208",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "195",
    y1: "370",
    x2: "187",
    y2: "640",
    stroke: "#1A1208",
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("g", {
    opacity: "0.3"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "155",
    y: "430",
    width: "130",
    height: "60",
    fill: "#1A1208"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "145,490 220,510 295,490",
    fill: "#1A1208"
  })), /*#__PURE__*/React.createElement("path", {
    d: "M100 200 Q108 195, 116 200 Q124 195, 132 200",
    stroke: "#1A1208",
    strokeWidth: "1.5",
    fill: "none",
    opacity: "0.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M450 240 Q458 235, 466 240 Q474 235, 482 240",
    stroke: "#1A1208",
    strokeWidth: "1.2",
    fill: "none",
    opacity: "0.5"
  }));
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
    const onVisible = () => {
      if (!document.hidden) tryPlay();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Fallback iOS : au premier touch l'utilisateur débloque l'autoplay
    const onTouch = () => tryPlay();
    document.addEventListener('touchstart', onTouch, {
      once: true
    });
    return () => {
      vid.removeEventListener('canplay', tryPlay);
      vid.removeEventListener('loadedmetadata', tryPlay);
      vid.removeEventListener('playing', () => setVideoReady(true));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 overflow-hidden"
  }, /*#__PURE__*/React.createElement("style", null, `
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-start-playback-button { display:none!important; -webkit-appearance:none; }
      `), /*#__PURE__*/React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "auto",
    poster: HERO_POSTER,
    disablePictureInPicture: true,
    "x-webkit-airplay": "deny",
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center center',
      pointerEvents: 'none'
    },
    src: window.matchMedia('(max-width: 767px)').matches ? HERO_540 : HERO_720
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0",
    style: {
      backgroundColor: 'rgba(15,40,101,0.32)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-x-0 top-0 h-40 pointer-events-none",
    style: {
      background: 'linear-gradient(180deg, rgba(10,31,61,0.45) 0%, rgba(10,31,61,0) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-x-0 bottom-0 h-40 pointer-events-none",
    style: {
      background: 'linear-gradient(0deg, rgba(10,31,61,0.4) 0%, rgba(10,31,61,0) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none",
    style: {
      background: 'radial-gradient(ellipse at 50% 50%, rgba(10,31,61,0.0) 35%, rgba(10,31,61,0.35) 100%)'
    }
  }));
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
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStep(s => s === 0 ? 1 : s);
        obs.disconnect();
      }
    }, {
      threshold: 0.25
    });
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
  const advance = () => setStep(s => s + 1);
  const isDone = step >= 9;

  // Pour l'accessibilité : texte complet en sr-only quand on est en mode animation
  const fullDef = `typique [tchipik]. adj. Qui caractérise sans qu'on sache l'expliquer. n.f. Vêtements oversize, pensés pour celles et ceux qui vivent entre sel et soleil. Un pied dans l'Atlantique, l'autre dans la Méditerranée.`;
  return /*#__PURE__*/React.createElement("section", {
    id: "definition",
    ref: sectionRef,
    className: "relative py-20 md:py-40 px-6",
    style: {
      backgroundColor: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-2xl mx-auto text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center gap-4 mb-12 opacity-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-px w-12",
    style: {
      background: '#0F2865'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter text-xs tracking-[0.4em]",
    style: {
      color: '#0F2865'
    }
  }, "I."), /*#__PURE__*/React.createElement("div", {
    className: "h-px w-12",
    style: {
      background: '#0F2865'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "sr-only"
  }, fullDef), /*#__PURE__*/React.createElement("div", {
    className: "text-left md:text-center",
    "aria-hidden": !isDone,
    style: {
      color: '#0F2865'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "mb-4",
    style: {
      minHeight: '1.2em'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-american-tw text-3xl md:text-5xl"
  }, /*#__PURE__*/React.createElement(Typewriter, {
    text: "typique",
    start: step >= 1,
    speed: 95,
    onDone: () => step === 1 && advance(),
    showCursor: step === 1,
    instant: reduceMotion
  })), /*#__PURE__*/React.createElement("span", {
    className: "font-american-tw ml-3 text-xl md:text-2xl",
    style: {
      opacity: 0.7
    }
  }, /*#__PURE__*/React.createElement(Typewriter, {
    text: "[tchipik]",
    start: step >= 2,
    speed: 85,
    onDone: () => step === 2 && setStep(3),
    showCursor: step === 2,
    instant: reduceMotion
  }))), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-lg md:text-xl leading-relaxed mb-3",
    style: {
      minHeight: '1.6em',
      visibility: step >= 4 || reduceMotion ? 'visible' : 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-serif-fine italic",
    style: {
      opacity: 0.7
    }
  }, "adj."), ' ', /*#__PURE__*/React.createElement(Typewriter, {
    text: "Qui caract\xE9rise sans qu'on sache l'expliquer.",
    start: step >= 4,
    speed: 28,
    onDone: () => step === 4 && setStep(5),
    showCursor: step === 4,
    instant: reduceMotion
  })), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-lg md:text-xl leading-relaxed",
    style: {
      minHeight: '3.2em',
      visibility: step >= 6 || reduceMotion ? 'visible' : 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-serif-fine italic",
    style: {
      opacity: 0.7
    }
  }, "n.f."), ' ', /*#__PURE__*/React.createElement(Typewriter, {
    text: "V\xEAtements oversize, pens\xE9s pour celles et ceux qui vivent ",
    start: step >= 6,
    speed: 26,
    onDone: () => step === 6 && setStep(7),
    showCursor: step === 6,
    instant: reduceMotion
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#E39A7C',
      fontStyle: 'italic'
    }
  }, /*#__PURE__*/React.createElement(Typewriter, {
    text: "entre sel et soleil",
    start: step >= 7,
    speed: 42,
    onDone: () => step === 7 && setStep(8),
    showCursor: step === 7,
    instant: reduceMotion
  })), /*#__PURE__*/React.createElement(Typewriter, {
    text: ". Un pied dans l'Atlantique, l'autre dans la M\xE9diterran\xE9e.",
    start: step >= 8,
    speed: 26,
    onDone: () => step === 8 && setStep(9),
    showCursor: step === 8,
    instant: reduceMotion
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-12 flex justify-center"
  }, /*#__PURE__*/React.createElement(WaveDivider, {
    color: "#0F2865",
    width: 140,
    strokeWidth: 1
  }))));
}

// ============================================================
// CART SIDEBAR
// ============================================================
function CartSidebar({
  items,
  onClose,
  onRemove,
  onUpdateQty,
  total,
  cartCount,
  onCheckout
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-40",
    style: {
      backgroundColor: 'rgba(10,31,61,0.35)',
      backdropFilter: 'blur(2px)'
    },
    onClick: onClose
  }), /*#__PURE__*/React.createElement("div", {
    className: "fixed top-0 right-0 h-full z-50 flex flex-col",
    style: {
      width: 'min(420px, 100vw)',
      backgroundColor: '#F4F1EC',
      boxShadow: '-8px 0 40px rgba(10,31,61,0.18)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between px-7 py-6",
    style: {
      borderBottom: '1px solid rgba(15,40,101,0.1)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.35em] uppercase",
    style: {
      color: '#E39A7C'
    }
  }, "Panier"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-sm mt-0.5",
    style: {
      opacity: 0.6
    }
  }, cartCount, " pi\xE8ce", cartCount > 1 ? 's' : '')), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "font-typewriter text-xs tracking-wider",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#0F2865',
      opacity: 0.5
    }
  }, "\u2715 Fermer")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto px-7 py-6 space-y-5"
  }, items.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-center mt-16",
    style: {
      opacity: 0.45
    }
  }, "Ton panier est vide.") : items.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.key,
    className: "flex gap-4 pb-5",
    style: {
      borderBottom: '1px solid rgba(15,40,101,0.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 flex-shrink-0",
    style: {
      backgroundColor: item.product.bg,
      borderRadius: '2px',
      overflow: 'hidden'
    }
  }, item.product.photos && item.product.photos.length > 0 ? /*#__PURE__*/React.createElement("img", {
    src: item.product.photos[0],
    alt: item.product.name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      transform: 'scale(0.7)',
      transformOrigin: 'center',
      width: '100%',
      height: '100%'
    }
  }, item.product.mockup)), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-sm mb-0.5"
  }, item.product.name), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs mb-2",
    style: {
      opacity: 0.5
    }
  }, "Taille ", item.size), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onUpdateQty(item.key, -1),
    className: "w-6 h-6 flex items-center justify-center font-typewriter text-xs",
    style: {
      border: '1px solid rgba(15,40,101,0.2)',
      borderRadius: '2px',
      background: 'none',
      cursor: 'pointer',
      color: '#0F2865'
    }
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter text-sm w-4 text-center"
  }, item.qty), /*#__PURE__*/React.createElement("button", {
    onClick: () => onUpdateQty(item.key, 1),
    className: "w-6 h-6 flex items-center justify-center font-typewriter text-xs",
    style: {
      border: '1px solid rgba(15,40,101,0.2)',
      borderRadius: '2px',
      background: 'none',
      cursor: 'pointer',
      color: '#0F2865'
    }
  }, "+")), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm"
  }, item.product.priceNum * item.qty, " \u20AC"))), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemove(item.key),
    className: "font-typewriter text-[10px] self-start mt-1",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      opacity: 0.3,
      color: '#0F2865'
    }
  }, "\u2715")))), items.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "px-7 py-6",
    style: {
      borderTop: '1px solid rgba(15,40,101,0.1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between mb-6"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter text-sm tracking-wider uppercase",
    style: {
      opacity: 0.6
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    className: "font-serif text-2xl"
  }, total, " \u20AC")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCheckout,
    className: "w-full py-4 font-typewriter text-sm tracking-widest uppercase",
    style: {
      backgroundColor: '#E39A7C',
      color: '#F4F1EC',
      border: 'none',
      borderRadius: '2px',
      cursor: 'pointer'
    }
  }, "Commander \u2192"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onClose();
      setTimeout(() => {
        const el = document.getElementById('boutique');
        if (el) el.scrollIntoView({
          behavior: 'smooth'
        });
      }, 100);
    },
    className: "w-full py-3 font-typewriter text-xs tracking-widest uppercase",
    style: {
      backgroundColor: 'transparent',
      color: '#0F2865',
      border: '1px solid rgba(15,40,101,0.2)',
      borderRadius: '2px',
      cursor: 'pointer',
      opacity: 0.7
    }
  }, "\u2190 Continuer mes achats")))));
}

// ============================================================
// LEGAL MODAL — CGV / Mentions légales / Confidentialité
// ============================================================
const LEGAL_CONTENT = {
  mentions: {
    title: 'Mentions légales',
    sections: [{
      heading: 'Éditeur du site',
      text: `Raison sociale : Typique\nNom : Coline Chartier\nAdresse : 58 rue Denise Vernay, 13330 Pélissanne, France\nSIRET : 94116866800015\nEmail : typique.fr@gmail.com\nSite : www.boutiquetypique.fr`
    }, {
      heading: 'Hébergement',
      text: `Ce site est hébergé par Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, USA — vercel.com`
    }, {
      heading: 'Propriété intellectuelle',
      text: `L'ensemble des contenus présents sur ce site (textes, photographies, visuels, logo) sont la propriété exclusive de Typique / Coline Chartier. Toute reproduction, même partielle, est interdite sans autorisation préalable écrite.`
    }, {
      heading: 'Responsabilité',
      text: `Typique s'efforce de maintenir les informations publiées à jour mais ne saurait être tenu responsable d'erreurs, omissions ou résultats obtenus d'une mauvaise utilisation de ces informations.`
    }]
  },
  cgv: {
    title: 'Conditions Générales de Vente',
    sections: [{
      heading: '1. Vendeur',
      text: `Coline Chartier — Typique\n58 rue Denise Vernay, 13330 Pélissanne\nSIRET : 94116866800015\nEmail : typique.fr@gmail.com`
    }, {
      heading: '2. Produits',
      text: `Les produits proposés à la vente sont des articles de prêt-à-porter (t-shirts, sweats, accessoires) fabriqués en quantités limitées. Les caractéristiques essentielles de chaque produit (description, taille, prix) sont présentées sur le site.`
    }, {
      heading: '3. Prix',
      text: `Les prix sont indiqués en euros TTC. En tant que micro-entrepreneur sous le régime de franchise en base de TVA (article 293 B du CGI), la TVA n'est pas applicable. Typique se réserve le droit de modifier ses prix à tout moment, mais les produits seront facturés sur la base du tarif en vigueur au moment de la validation de la commande.`
    }, {
      heading: '4. Commandes — modèle drop',
      text: `Les ventes s'effectuent par périodes limitées appelées "drops". Le paiement est immédiat et effectué au moment de la commande via Shopify Payments. Les commandes passées lors d'un drop sont expédiées en lot après la fermeture de la période de vente. La livraison est assurée uniquement en France métropolitaine.`
    }, {
      heading: '5. Paiement',
      text: `Le paiement s'effectue en ligne par carte bancaire via Shopify Payments (solution sécurisée). La commande est validée à réception du paiement. Aucune donnée bancaire n'est conservée par Typique.`
    }, {
      heading: '6. Livraison',
      text: `Les commandes sont expédiées en lot après la fermeture du drop. Un email de confirmation avec numéro de suivi vous sera envoyé à l'expédition. La livraison est assurée uniquement en France métropolitaine. Les délais indicatifs sont de 3 à 5 jours ouvrés après expédition.`
    }, {
      heading: '7. Droit de rétractation',
      text: `Conformément à l'article L221-18 du Code de la consommation, vous disposez d'un délai de 14 jours à compter de la réception de votre commande pour exercer votre droit de rétractation, sans avoir à justifier de motifs. Pour exercer ce droit, contactez-nous à typique.fr@gmail.com. Les frais de retour sont à la charge du client. Le remboursement sera effectué dans les 14 jours suivant réception du retour.`
    }, {
      heading: '8. Réclamations',
      text: `Pour toute réclamation, contactez-nous à typique.fr@gmail.com. En cas de litige, une solution amiable sera recherchée avant tout recours judiciaire. Le client peut également recourir à la plateforme européenne de règlement en ligne des litiges : ec.europa.eu/consumers/odr`
    }, {
      heading: '9. Droit applicable',
      text: `Les présentes CGV sont soumises au droit français. Tout litige relatif à leur interprétation ou exécution relève des tribunaux compétents de Aix-en-Provence.`
    }]
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    sections: [{
      heading: 'Responsable du traitement',
      text: `Coline Chartier — Typique\n58 rue Denise Vernay, 13330 Pélissanne\nEmail : typique.fr@gmail.com`
    }, {
      heading: 'Données collectées',
      text: `Lors d'une commande : nom, prénom, adresse de livraison, adresse email, numéro de téléphone.\nVia le formulaire d'alertes drop : adresse email uniquement.\nAucune donnée bancaire n'est collectée ou conservée par Typique — le paiement est traité par Shopify Payments.`
    }, {
      heading: 'Finalités du traitement',
      text: `Les données collectées sont utilisées pour :\n— Traiter et expédier vos commandes\n— Vous envoyer votre confirmation de commande et suivi de livraison\n— Vous informer des prochains drops si vous y avez consenti\n— Respecter nos obligations légales et comptables`
    }, {
      heading: 'Base légale',
      text: `Le traitement de vos données est fondé sur l'exécution du contrat de vente (commandes), votre consentement (alertes drops) et notre intérêt légitime (gestion administrative).`
    }, {
      heading: 'Durée de conservation',
      text: `Données de commande : 10 ans (obligation comptable légale).\nEmails d'alerte drop : jusqu'à désinscription ou 3 ans sans activité.`
    }, {
      heading: 'Vos droits',
      text: `Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Pour exercer ces droits, écrivez à typique.fr@gmail.com. Vous avez également le droit d'introduire une réclamation auprès de la CNIL (cnil.fr).`
    }, {
      heading: 'Cookies',
      text: `Ce site n'utilise pas de cookies de traçage ou publicitaires. Des cookies techniques strictement nécessaires au fonctionnement du site peuvent être déposés.`
    }, {
      heading: 'Sous-traitants',
      text: `Shopify Inc. (paiement et gestion des commandes) — conforme RGPD.\nVercel Inc. (hébergement) — conforme RGPD.\nBrevo (Sendinblue SAS, France — envoi des emails d'alerte drop) — conforme RGPD.`
    }]
  }
};
function LegalModal({
  page,
  onClose
}) {
  const content = LEGAL_CONTENT[page];
  const pages = [{
    key: 'mentions',
    label: 'Mentions légales'
  }, {
    key: 'cgv',
    label: 'CGV'
  }, {
    key: 'confidentialite',
    label: 'Confidentialité'
  }];
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);
  const [activePage, setActivePage] = useState(page);
  const c = LEGAL_CONTENT[activePage];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 19999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(15,40,101,0.6)',
      backdropFilter: 'blur(4px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      backgroundColor: '#F4F1EC',
      borderRadius: '2px',
      width: '92vw',
      maxWidth: 760,
      maxHeight: '88vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 32px 80px -16px rgba(15,40,101,0.4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 32px 0',
      borderBottom: '1px solid rgba(15,40,101,0.1)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.3em] uppercase",
    style: {
      opacity: 0.45
    }
  }, "Informations l\xE9gales"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'rgba(15,40,101,0.08)',
      border: 'none',
      borderRadius: '50%',
      width: 32,
      height: 32,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865',
      fontSize: 16
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 0
    }
  }, pages.map(pg => /*#__PURE__*/React.createElement("button", {
    key: pg.key,
    onClick: () => setActivePage(pg.key),
    className: "font-typewriter text-xs tracking-wider",
    style: {
      padding: '10px 18px',
      border: 'none',
      cursor: 'pointer',
      background: 'none',
      borderBottom: activePage === pg.key ? '2px solid #0F2865' : '2px solid transparent',
      color: activePage === pg.key ? '#0F2865' : 'rgba(15,40,101,0.45)',
      fontWeight: activePage === pg.key ? 600 : 400,
      transition: 'all 0.2s'
    }
  }, pg.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      padding: '28px 32px 36px',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-serif",
    style: {
      fontSize: '1.4rem',
      marginBottom: 24,
      color: '#0F2865'
    }
  }, c.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, c.sections.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-typewriter text-xs tracking-[0.25em] uppercase mb-3",
    style: {
      color: '#E39A7C'
    }
  }, s.heading), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine text-sm leading-relaxed",
    style: {
      color: '#0F2865',
      opacity: 0.8,
      whiteSpace: 'pre-line'
    }
  }, s.text)))), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs mt-10",
    style: {
      opacity: 0.4
    }
  }, "Derni\xE8re mise \xE0 jour : juin 2026"))));
}

// ============================================================
// PRODUCT CARD
// ============================================================
function ProductCard({
  product: p,
  onAddToCart,
  dropStatus,
  onOpenDetail
}) {
  const [selectedSize, setSelectedSize] = useState(p.sizes[0]);
  const [buying, setBuying] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const isOpen = dropStatus === 'active_1' || dropStatus === 'active_2';
  const hasPhotos = p.photos && p.photos.length > 0;
  const handleAdd = e => {
    e.stopPropagation();
    if (!isOpen) return;
    onAddToCart(p, selectedSize || 'Taille unique');
  };
  const handleSizeClick = (e, s) => {
    e.stopPropagation();
    setSelectedSize(s);
  };
  const handlePhotoNav = (e, fn) => {
    e.stopPropagation();
    setPhotoIdx(fn);
  };
  return /*#__PURE__*/React.createElement("article", {
    className: "product-card relative overflow-hidden flex flex-col",
    style: {
      backgroundColor: '#FFFFFF',
      borderRadius: '2px',
      boxShadow: '0 14px 40px -28px rgba(15,40,101,0.3)',
      cursor: 'pointer'
    },
    onClick: () => onOpenDetail(p)
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative overflow-hidden",
    style: {
      backgroundColor: p.bg,
      aspectRatio: hasPhotos ? '3/4' : '1/1'
    }
  }, hasPhotos ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("img", {
    src: p.photos[photoIdx],
    alt: p.name,
    loading: "lazy",
    decoding: "async",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      transition: 'opacity 0.25s'
    }
  }), p.photos.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: e => handlePhotoNav(e, i => (i - 1 + p.photos.length) % p.photos.length),
    style: {
      position: 'absolute',
      left: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(244,241,236,0.88)',
      border: 'none',
      borderRadius: '50%',
      width: 30,
      height: 30,
      cursor: 'pointer',
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865'
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    onClick: e => handlePhotoNav(e, i => (i + 1) % p.photos.length),
    style: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(244,241,236,0.88)',
      border: 'none',
      borderRadius: '50%',
      width: 30,
      height: 30,
      cursor: 'pointer',
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865'
    }
  }, "\u203A"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 10,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      gap: 5
    }
  }, p.photos.map((_, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: e => {
      e.stopPropagation();
      setPhotoIdx(i);
    },
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      transition: 'background 0.2s',
      backgroundColor: photoIdx === i ? '#0F2865' : 'rgba(255,255,255,0.75)'
    }
  }))))) : p.mockup), /*#__PURE__*/React.createElement("div", {
    className: "p-5 flex flex-col flex-1",
    style: {
      color: '#0F2865'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs uppercase tracking-[0.3em] mb-1.5",
    style: {
      opacity: 0.5
    }
  }, p.cat === 'SWEATS' ? 'HOODIES' : p.cat), /*#__PURE__*/React.createElement("h3", {
    className: "font-typewriter text-lg mb-2"
  }, p.name), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm leading-relaxed mb-3 flex-1",
    style: {
      opacity: 0.72
    }
  }, p.desc), /*#__PURE__*/React.createElement("div", {
    className: "mt-auto"
  }, p.color && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 14,
      height: 14,
      borderRadius: '2px',
      flexShrink: 0,
      backgroundColor: p.color.hex,
      border: '1px solid rgba(15,40,101,0.18)',
      backgroundImage: p.color.washed ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px)' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter text-[10px] tracking-wider",
    style: {
      color: '#0F2865',
      opacity: 0.55
    }
  }, p.color.label)), p.sizes.length > 1 ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5 mb-4"
  }, p.sizes.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: e => handleSizeClick(e, s),
    className: "font-typewriter text-[11px] tracking-wider px-2.5 py-1 transition-all duration-200",
    style: {
      borderRadius: '2px',
      border: '1px solid',
      borderColor: selectedSize === s ? '#0F2865' : 'rgba(15,40,101,0.2)',
      backgroundColor: selectedSize === s ? '#0F2865' : 'transparent',
      color: selectedSize === s ? '#F4F1EC' : 'rgba(15,40,101,0.6)',
      cursor: 'pointer'
    }
  }, s))) : /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[11px] tracking-wider mb-4",
    style: {
      opacity: 0.45
    }
  }, "Taille unique"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-serif text-xl"
  }, p.price), /*#__PURE__*/React.createElement("button", {
    onClick: handleAdd,
    className: "font-typewriter text-xs tracking-wider uppercase px-4 py-2.5 transition-all duration-300",
    style: {
      borderRadius: '2px',
      backgroundColor: buying ? 'rgba(15,40,101,0.25)' : isOpen ? '#E39A7C' : 'rgba(15,40,101,0.12)',
      color: isOpen || buying ? '#F4F1EC' : 'rgba(15,40,101,0.4)',
      border: 'none',
      cursor: isOpen && !buying ? 'pointer' : 'default',
      opacity: buying ? 0.7 : 1
    }
  }, isOpen ? '+ Panier' : 'Bientôt')))));
}

// ============================================================
// PRODUCT MODAL — aperçu détaillé au clic
// ============================================================
function ProductModal({
  product: p,
  onClose,
  onAddToCart,
  dropStatus
}) {
  const [selectedSize, setSelectedSize] = useState(p.sizes[0]);
  const [buying, setBuying] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const isOpen = dropStatus === 'active_1' || dropStatus === 'active_2';
  const hasPhotos = p.photos && p.photos.length > 0;

  // Fermer avec Échap + bouton retour navigateur
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Bouton retour navigateur → ferme la modale
    window.history.pushState({
      modal: p.id
    }, '');
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
    onAddToCart(p, selectedSize || 'Taille unique');
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 19999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(15,40,101,0.55)',
      backdropFilter: 'blur(4px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      backgroundColor: '#F4F1EC',
      borderRadius: '2px',
      width: '92vw',
      maxWidth: 900,
      maxHeight: '92vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 32px 80px -16px rgba(15,40,101,0.4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      justifyContent: 'flex-end',
      padding: '10px 12px 0',
      backgroundColor: '#F4F1EC',
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'rgba(15,40,101,0.08)',
      border: 'none',
      borderRadius: '50%',
      width: 38,
      height: 38,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865',
      fontSize: 17,
      touchAction: 'manipulation'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      flex: 1,
      minHeight: 0
    },
    className: "modal-inner"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 50%',
      position: 'relative',
      backgroundColor: p.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    className: "modal-photo-col"
  }, hasPhotos ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("img", {
    src: p.photos[photoIdx],
    alt: p.name,
    onClick: () => setLightbox(true),
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      cursor: 'zoom-in'
    }
  }), p.photos.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onPointerUp: () => setPhotoIdx(i => (i - 1 + p.photos.length) % p.photos.length),
    style: {
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(244,241,236,0.88)',
      border: 'none',
      borderRadius: '50%',
      width: 44,
      height: 44,
      cursor: 'pointer',
      fontSize: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865',
      touchAction: 'manipulation'
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    onPointerUp: () => setPhotoIdx(i => (i + 1) % p.photos.length),
    style: {
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(244,241,236,0.88)',
      border: 'none',
      borderRadius: '50%',
      width: 44,
      height: 44,
      cursor: 'pointer',
      fontSize: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0F2865',
      touchAction: 'manipulation'
    }
  }, "\u203A"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 14,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      gap: 8
    }
  }, p.photos.map((_, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onPointerUp: () => setPhotoIdx(i),
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      transition: 'background 0.2s',
      touchAction: 'manipulation',
      backgroundColor: photoIdx === i ? '#0F2865' : 'rgba(15,40,101,0.25)'
    }
  }))))) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 32
    }
  }, p.mockup)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '40px 36px 36px',
      overflowY: 'auto',
      color: '#0F2865',
      display: 'flex',
      flexDirection: 'column'
    },
    className: "modal-info-col"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs uppercase tracking-[0.3em] mb-2",
    style: {
      opacity: 0.45
    }
  }, p.cat === 'SWEATS' ? 'HOODIES' : p.cat), /*#__PURE__*/React.createElement("h2", {
    className: "font-typewriter mb-3",
    style: {
      fontSize: '1.6rem',
      lineHeight: 1.15
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    className: "font-serif leading-relaxed mb-6",
    style: {
      opacity: 0.72,
      fontSize: '0.95rem'
    }
  }, p.desc), p.sizeNote && /*#__PURE__*/React.createElement("div", {
    style: {
      borderLeft: '2px solid #E39A7C',
      paddingLeft: 14,
      marginBottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, p.sizeNote.split(' · ').map((line, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    className: "font-typewriter text-[11px] tracking-wider",
    style: {
      color: '#E39A7C'
    }
  }, i === 0 ? '↳ ' : '  ', line))), p.color && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 16,
      borderRadius: '2px',
      flexShrink: 0,
      backgroundColor: p.color.hex,
      border: '1px solid rgba(15,40,101,0.18)',
      backgroundImage: p.color.washed ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px)' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter text-[11px] tracking-wider",
    style: {
      color: '#0F2865',
      opacity: 0.55
    }
  }, p.color.label)), p.sizes.length > 1 ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 mb-6"
  }, p.sizes.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setSelectedSize(s),
    className: "font-typewriter text-xs tracking-wider px-3 py-1.5 transition-all duration-200",
    style: {
      borderRadius: '2px',
      border: '1px solid',
      borderColor: selectedSize === s ? '#0F2865' : 'rgba(15,40,101,0.2)',
      backgroundColor: selectedSize === s ? '#0F2865' : 'transparent',
      color: selectedSize === s ? '#F4F1EC' : 'rgba(15,40,101,0.6)',
      cursor: 'pointer'
    }
  }, s))) : /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[11px] tracking-wider mb-6",
    style: {
      opacity: 0.45
    }
  }, "Taille unique"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mt-auto"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-serif",
    style: {
      fontSize: '1.5rem'
    }
  }, p.price), /*#__PURE__*/React.createElement("button", {
    onClick: handleAdd,
    className: "font-typewriter text-sm tracking-widest uppercase px-6 py-3 transition-all duration-300",
    style: {
      borderRadius: '2px',
      backgroundColor: buying ? 'rgba(15,40,101,0.25)' : isOpen ? '#E39A7C' : 'rgba(15,40,101,0.12)',
      color: isOpen || buying ? '#F4F1EC' : 'rgba(15,40,101,0.4)',
      border: 'none',
      cursor: isOpen && !buying ? 'pointer' : 'default',
      opacity: buying ? 0.7 : 1
    }
  }, isOpen ? 'Ajouter au panier →' : 'Bientôt disponible'))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 640px) {
          .modal-inner { flex-direction: column !important; overflow-y: auto !important; }
          .modal-photo-col { flex: 0 0 auto !important; width: 100% !important; height: 52vh !important; min-height: unset !important; }
          .modal-info-col { padding: 20px 18px 32px !important; overflow-y: visible !important; flex: 0 0 auto !important; }
          .modal-photo-col img { cursor: zoom-in; }
        }
      `), lightbox && hasPhotos && /*#__PURE__*/React.createElement("div", {
    onClick: () => setLightbox(false),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      backgroundColor: 'rgba(0,0,0,0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.photos[photoIdx],
    alt: p.name,
    style: {
      maxWidth: '100vw',
      maxHeight: '100vh',
      objectFit: 'contain',
      display: 'block'
    }
  }), p.photos.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setPhotoIdx(i => (i - 1 + p.photos.length) % p.photos.length);
    },
    style: {
      position: 'absolute',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '50%',
      width: 44,
      height: 44,
      cursor: 'pointer',
      fontSize: 22,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setPhotoIdx(i => (i + 1) % p.photos.length);
    },
    style: {
      position: 'absolute',
      right: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '50%',
      width: 44,
      height: 44,
      cursor: 'pointer',
      fontSize: 22,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "\u203A")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLightbox(false),
    style: {
      position: 'absolute',
      top: 16,
      right: 16,
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '50%',
      width: 40,
      height: 40,
      cursor: 'pointer',
      fontSize: 18,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, "\u2715")));
}

// ============================================================
// BOUTIQUE SHOWCASE — sticky scroll (3 slides)
// ============================================================
function BoutiqueShowcase({
  onSelectCategory
}) {
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
        const next = progress < 0.333 ? 0 : progress < 0.666 ? 1 : 2;
        setActiveSlide(prev => prev !== next ? next : prev);
      });
    }
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  const slides = [{
    bg: '#C5BFB3',
    textColor: '#F4F1EC',
    accentColor: '#F4F1EC',
    label: 'Tee-shirts',
    catKey: 'T-SHIRTS',
    ctaLabel: 'Voir les tee-shirts',
    photo: typeof TSHIRT_SHOWCASE !== 'undefined' ? TSHIRT_SHOWCASE : typeof FERRET_P1 !== 'undefined' ? FERRET_P1 : null,
    photoPosition: 'center center',
    brightness: 0.38
  }, {
    bg: '#0F2865',
    textColor: '#F4F1EC',
    accentColor: '#E39A7C',
    label: 'Hoodies',
    catKey: 'SWEATS',
    ctaLabel: 'Voir les hoodies',
    photo: typeof HOODIES_SHOWCASE !== 'undefined' ? HOODIES_SHOWCASE : typeof SURFER_P1 !== 'undefined' ? SURFER_P1 : null,
    photoPosition: 'center center',
    brightness: 0.35
  }, {
    bg: '#6B6F4A',
    textColor: '#F4F1EC',
    accentColor: '#F4F1EC',
    label: 'Accessoires',
    catKey: 'ACCESSOIRES',
    ctaLabel: 'Voir les accessoires',
    photo: typeof ACCESSOIRES_SHOWCASE !== 'undefined' ? ACCESSOIRES_SHOWCASE : typeof GARRIGUE_P1 !== 'undefined' ? GARRIGUE_P1 : null,
    photoPosition: 'center center',
    brightness: 0.38
  }];

  // Hauteurs en CSS (showcase-track / showcase-sticky / showcase-content) : plus de recalcul
  // quand la barre d'adresse iOS apparaît ou disparaît, donc plus de saut pendant le scroll.
  return /*#__PURE__*/React.createElement("div", {
    ref: containerRef,
    className: "showcase-track",
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "showcase-sticky",
    style: {
      top: 0,
      overflow: 'hidden'
    }
  }, slides.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      position: 'absolute',
      inset: 0,
      backgroundColor: s.bg,
      transition: 'opacity 0.7s cubic-bezier(0.4,0,0.2,1)',
      opacity: activeSlide === i ? 1 : 0
    }
  })), slides.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      position: 'absolute',
      inset: 0,
      opacity: activeSlide === i ? 1 : 0,
      transition: 'opacity 0.7s cubic-bezier(0.4,0,0.2,1)',
      pointerEvents: 'none',
      willChange: 'opacity',
      transform: 'translateZ(0)'
    }
  }, s.photo && /*#__PURE__*/React.createElement("img", {
    src: s.photo,
    alt: s.label,
    loading: "lazy",
    decoding: "async",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: s.photoPosition || 'center center',
      filter: `brightness(${s.brightness || 0.4})`,
      transform: 'translateZ(0)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "showcase-content",
    style: {
      position: 'relative',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingLeft: 'max(6vw, 24px)',
      paddingRight: 'max(14vw, 72px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '0.2em'
    }
  }, slides.map((s, i) => {
    const isActive = activeSlide === i;
    const activeColor = slides[activeSlide].textColor;
    return /*#__PURE__*/React.createElement("p", {
      key: i,
      className: isActive ? 'showcase-label-active' : 'showcase-label-inactive',
      style: {
        fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
        fontStyle: 'italic',
        fontWeight: 400,
        fontSize: isActive ? 'clamp(3.8rem, 13vw, 8rem)' : 'clamp(1.4rem, 5vw, 3rem)',
        lineHeight: 1.05,
        color: activeColor,
        opacity: isActive ? 1 : 0.2,
        transition: 'font-size 0.65s cubic-bezier(0.4,0,0.2,1), opacity 0.65s cubic-bezier(0.4,0,0.2,1)',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        cursor: 'default',
        userSelect: 'none'
      }
    }, s.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '2.5rem',
      position: 'relative',
      height: '1.6rem'
    }
  }, slides.map((s, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#pieces",
    onClick: () => onSelectCategory && onSelectCategory(s.catKey),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
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
      transition: 'opacity 0.5s, color 0.5s, border-color 0.5s'
    },
    onMouseEnter: e => {
      if (activeSlide === i) e.currentTarget.style.opacity = '1';
    },
    onMouseLeave: e => {
      if (activeSlide === i) e.currentTarget.style.opacity = '0.85';
    }
  }, s.ctaLabel, " \u2192")))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 'max(4vw, 20px)',
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '0.55rem',
      letterSpacing: '0.2em',
      color: slides[activeSlide].textColor,
      opacity: 0.45,
      marginBottom: '4px',
      transition: 'color 0.5s'
    }
  }, activeSlide + 1, "/3"), [0, 1, 2].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: '1px',
      height: activeSlide === i ? '32px' : '12px',
      backgroundColor: slides[activeSlide].textColor,
      opacity: activeSlide === i ? 0.85 : 0.22,
      transition: 'height 0.55s cubic-bezier(0.4,0,0.2,1), opacity 0.55s, background-color 0.5s',
      borderRadius: '1px'
    }
  })))));
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
function TypiqueSite() {
  const [scrolled, setScrolled] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('TOUT');
  const [notifEmail, setNotifEmail] = useState('');
  const [notifSubmitted, setNotifSubmitted] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [legalModal, setLegalModal] = useState(null); // 'cgv' | 'mentions' | 'confidentialite'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ---- DROP CONFIG ----
  const DROP_1 = {
    start: new Date('2026-06-05T16:25:00'),
    end: new Date('2026-06-15T00:01:00'),
    label: 'Drop 1'
  };
  const DROP_2 = {
    start: new Date('2026-07-15T14:00:00'),
    end: new Date('2026-07-25T20:00:00'),
    label: 'Drop 2'
  };
  const now = new Date();
  const dropStatus = now < DROP_1.start ? 'before_1' : now <= DROP_1.end ? 'active_1' : now < DROP_2.start ? 'between' : now <= DROP_2.end ? 'active_2' : 'closed';
  const nextDrop = dropStatus === 'before_1' ? DROP_1 : dropStatus === 'between' ? DROP_2 : null;
  const activeDrop = dropStatus === 'active_1' ? DROP_1 : dropStatus === 'active_2' ? DROP_2 : null;

  // ---- COUNTDOWN ----
  // Le décompte vit dans <CountdownDigits> ; à son terme il force un re-rendu pour basculer le statut du drop.
  const [, setDropTick] = useState(0);
  const refreshDropStatus = () => setDropTick(t => t + 1);

  // ---- CART ----
  const addToCart = (product, size) => {
    setCartItems(prev => {
      const key = `${product.id}-${size}`;
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? {
        ...i,
        qty: i.qty + 1
      } : i);
      return [...prev, {
        key,
        product,
        size,
        qty: 1
      }];
    });
    setCartOpen(true);
    loadShopifySdk().catch(() => {}); // pré-chargé pendant que le client regarde son panier
  };
  const removeFromCart = key => setCartItems(prev => prev.filter(i => i.key !== key));
  const updateQty = (key, delta) => setCartItems(prev => prev.map(i => i.key === key ? {
    ...i,
    qty: i.qty + delta
  } : i).filter(i => i.qty > 0));
  const cartTotal = cartItems.reduce((sum, i) => sum + i.product.priceNum * i.qty, 0);
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  // ---- PRODUCTS ----
  const products = [{
    id: 'ts-ferret',
    ref: 'TS 01',
    cat: 'T-SHIRTS',
    name: 'Le Ferret',
    price: '44 €',
    priceNum: 44,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
    color: {
      hex: '#3A3D44',
      label: 'Gris'
    },
    desc: "Le t-shirt en hommage au Cap, aux étés qui ne finissent pas, aux maisons avec tant de souvenirs qu\'on ne veut plus quitter.",
    photos: [FERRET_AVANT, FERRET_ARRIERE, FERRET_P1, FERRET_P2, FERRET_P3, FERRET_P4],
    mockup: /*#__PURE__*/React.createElement(TshirtMockup, {
      bodyColor: "#3A3D44",
      letterColor: "#F4F1EC",
      letterStroke: "#E39A7C"
    }),
    bg: '#E8E3DB'
  }, {
    id: 'ts-entredeux',
    ref: 'TS 02',
    cat: 'T-SHIRTS',
    name: "L'Entre Deux",
    price: '44 €',
    priceNum: 44,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
    color: {
      hex: '#6B6F4A',
      label: 'Kaki'
    },
    desc: 'Neuf mots dans le dos. Garrigue, baïne, mistral, tchanquée. Tout ce qui fait typique, en une seule pièce.',
    mockup: /*#__PURE__*/React.createElement(TshirtMockup, {
      bodyColor: "#6B6F4A",
      letterColor: "#F4F1EC",
      letterStroke: "rgba(244,241,236,0.4)"
    }),
    bg: '#E0DDD3',
    photos: [...(typeof ENTREDEUX_AVANT !== 'undefined' ? [ENTREDEUX_AVANT] : []), ...(typeof ENTREDEUX_ARRIERE !== 'undefined' ? [ENTREDEUX_ARRIERE] : []), ...(typeof ENTREDEUX_P3 !== 'undefined' ? [ENTREDEUX_P3] : []), ...(typeof ENTREDEUX_P4 !== 'undefined' ? [ENTREDEUX_P4] : [])].filter(Boolean)
  }, {
    id: 'ts-sable',
    ref: 'TS 03',
    cat: 'T-SHIRTS',
    name: 'Sable chaud',
    price: '38 €',
    priceNum: 38,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Conseillé de prendre une taille en dessous de votre taille habituelle pour les femmes · Laver à 30° à l\'envers',
    color: {
      hex: '#D6C8B4',
      label: 'Crème'
    },
    desc: 'Le plus discret de la collection. Des vêtements simples et épurés, comme on aime.',
    photos: [SABLE_NOUVEAU, SABLE_P1, SABLE_P2],
    mockup: /*#__PURE__*/React.createElement(TshirtMockup, {
      bodyColor: "#C4B49A",
      letterColor: "#E39A7C",
      letterStroke: "rgba(227,154,124,0.3)"
    }),
    bg: '#EDE7DC'
  }, {
    id: 'sw-mistral',
    ref: 'SW 01',
    cat: 'SWEATS',
    name: 'Le Mistral',
    price: '75 €',
    priceNum: 75,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
    color: {
      hex: '#1A2B5E',
      label: 'Noir'
    },
    desc: "Après que le mistral est tout emporté, il ne reste que la simplicité et l'authenticité.",
    photos: [MISTRAL_AVANT, MISTRAL_R2, MISTRAL_R3],
    mockup: /*#__PURE__*/React.createElement(HoodieMockup, {
      bodyColor: "#1A2B5E",
      letterColor: "#F4F1EC"
    }),
    bg: '#D8DCE8'
  }, {
    id: 'sw-tchanquee',
    ref: 'SW 02',
    cat: 'SWEATS',
    name: 'La Tchanquée',
    price: '84 €',
    priceNum: 84,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
    color: {
      hex: '#EDE8DF',
      label: 'Crème'
    },
    desc: "Comme une cabane tchanquée au coucher du soleil. Trois fois Typique pour les jours qui comptent triple sur le bassin.",
    photos: [TCHANQUEE_AVANT, TCHANQUEE_ARRIERE, TCHANQUEE_P1, TCHANQUEE_P2, TCHANQUEE_P3],
    mockup: /*#__PURE__*/React.createElement(HoodieMockup, {
      bodyColor: "#F4F1EC",
      letterColor: "#0F2865"
    }),
    bg: '#E5DFD3'
  }, {
    id: 'sw-surfer',
    ref: 'SW 03',
    cat: 'SWEATS',
    name: 'Le Surfer',
    price: '84 €',
    priceNum: 84,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sizeNote: 'Coupe oversize · Laver à 30° à l\'envers',
    color: {
      hex: '#0F1E36',
      label: 'Bleu nuit'
    },
    desc: "Bleu marine pour les matins de session, quand l'eau est encore froide et que personne n'a vu la lumière.",
    photos: [SURFER_AVANT, SURFER_ARRIERE, SURFER_R1, SURFER_R2, SURFER_R3, SURFER_R4],
    mockup: /*#__PURE__*/React.createElement(HoodieMockup, {
      bodyColor: "#0F2236",
      letterColor: "#F4F1EC"
    }),
    bg: '#CDD2DE'
  }, {
    id: 'acc-pilat',
    ref: 'ACC 01',
    cat: 'ACCESSOIRES',
    name: 'Le Pilat',
    price: '37 €',
    priceNum: 37,
    sizes: ['Taille unique'],
    color: {
      hex: '#2C2C2C',
      label: 'Noir washed',
      washed: true
    },
    desc: "Bob noir washed comme une dune au soleil rasant. Broderie typique, et basta.",
    photos: [BOB_PHOTO, PILAT_P1],
    mockup: /*#__PURE__*/React.createElement(BobMockup, {
      bodyColor: "#1F1F1F",
      labelColor: "#F4F1EC",
      labelText: "#E39A7C"
    }),
    bg: '#DDDAD5'
  }, {
    id: 'acc-garrigue',
    ref: 'ACC 02',
    cat: 'ACCESSOIRES',
    name: 'La Garrigue',
    price: '37 €',
    priceNum: 37,
    sizes: ['Taille unique'],
    color: {
      hex: '#6B6F4A',
      label: 'Kaki'
    },
    desc: "Velours côtelé kaki comme un buisson de thym brûlé par le mois d'août.",
    photos: [CASQUETTE_PHOTO, GARRIGUE_P1, GARRIGUE_P2, GARRIGUE_P3],
    mockup: /*#__PURE__*/React.createElement(CasquetteMockup, {
      bodyColor: "#6B6F4A",
      labelColor: "#F4F1EC"
    }),
    bg: '#DDE0D5'
  }];
  const categories = ['TOUT', 'T-SHIRTS', 'SWEATS', 'ACCESSOIRES'];
  const categoryLabels = {
    'TOUT': 'TOUT',
    'T-SHIRTS': 'T-SHIRTS',
    'SWEATS': 'HOODIES',
    'ACCESSOIRES': 'ACCESSOIRES'
  };
  const filteredProducts = activeCategory === 'TOUT' ? products : products.filter(p => p.cat === activeCategory);
  const lexique = ['garrigue', 'baïne', 'mistral', 'tchanquée', 'restanque', 'cachotte', 'farigoule', 'la leyre'];
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen w-full",
    style: {
      backgroundColor: '#F4F1EC',
      color: '#0F2865'
    }
  }, cartOpen && /*#__PURE__*/React.createElement(CartSidebar, {
    items: cartItems,
    onClose: () => setCartOpen(false),
    onRemove: removeFromCart,
    onUpdateQty: updateQty,
    total: cartTotal,
    cartCount: cartCount,
    onCheckout: () => {
      setCartOpen(false);
      checkoutCartItems(cartItems);
    }
  }), detailProduct && /*#__PURE__*/React.createElement(ProductModal, {
    product: detailProduct,
    onClose: () => setDetailProduct(null),
    onAddToCart: addToCart,
    dropStatus: dropStatus
  }), legalModal && /*#__PURE__*/React.createElement(LegalModal, {
    page: legalModal,
    onClose: () => setLegalModal(null)
  }), /*#__PURE__*/React.createElement("style", null, `
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
        .showcase-track { height: 300vh; }
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
      `), /*#__PURE__*/React.createElement("nav", {
    className: "fixed top-0 left-0 right-0 z-[9999] transition-all duration-500",
    style: {
      backgroundColor: scrolled || menuOpen ? 'rgba(244,241,236,0.97)' : 'transparent',
      backdropFilter: scrolled || menuOpen ? 'blur(8px)' : 'none',
      borderBottom: scrolled || menuOpen ? '1px solid rgba(15,40,101,0.08)' : '1px solid transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto px-6 md:px-10 py-5 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#hero",
    onClick: () => {
      setMenuOpen(false);
      setCartOpen(false);
      setDetailProduct(null);
    },
    className: "font-typewriter text-xl md:text-2xl",
    style: {
      color: scrolled || menuOpen ? '#0F2865' : '#F4F1EC'
    }
  }, "typique"), /*#__PURE__*/React.createElement("div", {
    className: "hidden md:flex items-center gap-10 text-sm tracking-wider uppercase font-american-tw",
    style: {
      color: scrolled ? '#0F2865' : '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#pieces",
    className: "link-under"
  }, "Boutique"), /*#__PURE__*/React.createElement("a", {
    href: "#histoire",
    className: "link-under"
  }, "Notre histoire"), /*#__PURE__*/React.createElement("a", {
    href: "#alertes",
    className: "link-under"
  }, "Alertes drops")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCartOpen(true),
    className: "relative font-typewriter text-xs md:text-sm tracking-widest uppercase flex items-center gap-2",
    style: {
      color: scrolled || menuOpen ? '#E39A7C' : '#F4F1EC',
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    }
  }, "Panier", cartCount > 0 && /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-typewriter",
    style: {
      backgroundColor: '#E39A7C',
      color: '#F4F1EC'
    }
  }, cartCount)), /*#__PURE__*/React.createElement("button", {
    className: "md:hidden flex flex-col justify-center items-center gap-[5px] w-8 h-8",
    onClick: () => setMenuOpen(o => !o),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    },
    "aria-label": "Menu"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: '22px',
      height: '1.5px',
      backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
      transition: 'transform 0.3s, opacity 0.3s',
      transform: menuOpen ? 'translateY(6.5px) rotate(45deg)' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: '22px',
      height: '1.5px',
      backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
      transition: 'opacity 0.2s',
      opacity: menuOpen ? 0 : 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: '22px',
      height: '1.5px',
      backgroundColor: scrolled || menuOpen ? '#0F2865' : '#F4F1EC',
      transition: 'transform 0.3s, opacity 0.3s',
      transform: menuOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "md:hidden overflow-hidden transition-all duration-300",
    style: {
      maxHeight: menuOpen ? '280px' : '0px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-6 pb-6 pt-2 flex flex-col gap-5",
    style: {
      borderTop: '1px solid rgba(15,40,101,0.08)'
    }
  }, [['#pieces', 'Boutique'], ['#histoire', 'Notre histoire'], ['#alertes', 'Alertes drops']].map(([href, label]) => /*#__PURE__*/React.createElement("a", {
    key: href,
    href: href,
    onClick: () => setMenuOpen(false),
    className: "font-typewriter text-sm tracking-[0.3em] uppercase",
    style: {
      color: '#0F2865'
    }
  }, label))))), /*#__PURE__*/React.createElement("section", {
    id: "hero",
    className: "relative h-screen min-h-[640px] w-full overflow-hidden grain"
  }, /*#__PURE__*/React.createElement(HeroScene, null), /*#__PURE__*/React.createElement("div", {
    className: "relative z-10 h-full flex flex-col items-center justify-center px-6 text-center",
    style: {
      color: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "hero-title font-typewriter leading-none",
    style: {
      fontSize: 'clamp(5rem, 18vw, 13rem)',
      textShadow: '0 6px 40px rgba(10,31,61,0.4)',
      fontWeight: 400
    }
  }, "typique"), /*#__PURE__*/React.createElement("div", {
    className: "hero-wave mt-8 md:mt-10"
  }, /*#__PURE__*/React.createElement(WaveDivider, {
    color: "#F4F1EC",
    width: 260,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement("p", {
    className: "hero-tagline mt-6 md:mt-10 font-serif-fine italic",
    style: {
      fontSize: 'clamp(0.82rem, 3vw, 1.4rem)',
      letterSpacing: '0.4em',
      textTransform: 'lowercase',
      opacity: 0.95
    }
  }, "entre sel et soleil")), /*#__PURE__*/React.createElement("div", {
    className: "absolute left-1/2 -translate-x-1/2 z-10",
    style: {
      bottom: '2.5rem'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#definition",
    className: "scroll-hint flex flex-col items-center gap-2",
    style: {
      color: '#F4F1EC'
    },
    "aria-label": "Faire d\xE9filer"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-american-tw text-xs uppercase",
    style: {
      letterSpacing: '0.35em',
      paddingLeft: '0.35em',
      /* compensation optique du letter-spacing */
      opacity: 0.85
    }
  }, "D\xE9couvrir"), /*#__PURE__*/React.createElement(ChevronDown, {
    size: 18,
    strokeWidth: 1.2
  })))), /*#__PURE__*/React.createElement(DefinitionSection, null), /*#__PURE__*/React.createElement(BoutiqueShowcase, {
    onSelectCategory: setActiveCategory
  }), /*#__PURE__*/React.createElement("section", {
    id: "pieces",
    className: "relative py-24 md:py-36 px-6",
    style: {
      backgroundColor: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("div", {
    className: "text-center mb-14"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.4em] mb-4",
    style: {
      color: '#E39A7C'
    }
  }, "II. BOUTIQUE"), /*#__PURE__*/React.createElement("h2", {
    className: "font-serif-fine italic",
    style: {
      fontSize: 'clamp(2rem,4vw,3.2rem)',
      color: '#0F2865',
      letterSpacing: '0.02em'
    }
  }, "La premi\xE8re collection"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif mt-4 text-base md:text-lg max-w-md mx-auto",
    style: {
      color: '#0F2865',
      opacity: 0.65
    }
  }, "Toutes oversize. Toutes brod\xE9es. Toutes pens\xE9es entre deux c\xF4tes."))), /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-12 py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4",
    style: {
      border: '1px solid rgba(15,40,101,0.12)',
      borderRadius: '2px',
      backgroundColor: dropStatus.startsWith('active') ? 'rgba(227,154,124,0.08)' : 'rgba(15,40,101,0.04)'
    }
  }, dropStatus === 'before_1' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.3em] uppercase mb-1",
    style: {
      color: '#E39A7C'
    }
  }, "Drop 1 \u2014 5 au 15 juin"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm mb-2",
    style: {
      opacity: 0.7
    }
  }, "Les commandes ouvrent dans"), /*#__PURE__*/React.createElement("a", {
    href: "#alertes",
    className: "font-typewriter text-[10px] tracking-[0.2em] uppercase link-under",
    style: {
      color: '#E39A7C',
      opacity: 0.75
    }
  }, "Recevoir l'alerte \u2192")), /*#__PURE__*/React.createElement(CountdownDigits, {
    target: DROP_1.start,
    color: "#0F2865",
    onExpire: refreshDropStatus
  })), dropStatus === 'active_1' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.3em] uppercase mb-1",
    style: {
      color: '#E39A7C'
    }
  }, "\u25CF Drop 1 ouvert"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm",
    style: {
      opacity: 0.7
    }
  }, "Fermeture des commandes le 15 juin \xE0 minuit")), /*#__PURE__*/React.createElement(CountdownDigits, {
    target: DROP_1.end,
    color: "#E39A7C",
    onExpire: refreshDropStatus
  })), dropStatus === 'between' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.3em] uppercase mb-1",
    style: {
      opacity: 0.5
    }
  }, "Drop 1 termin\xE9"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm",
    style: {
      opacity: 0.7
    }
  }, "Le prochain drop arrive fin juin")), /*#__PURE__*/React.createElement(CountdownDigits, {
    target: DROP_2.start,
    color: "#0F2865",
    onExpire: refreshDropStatus
  })), dropStatus === 'active_2' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.3em] uppercase mb-1",
    style: {
      color: '#E39A7C'
    }
  }, "\u25CF Drop 2 ouvert"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-sm",
    style: {
      opacity: 0.7
    }
  }, "Fermeture des commandes le 5 juillet \xE0 minuit")), /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.2em]",
    style: {
      color: '#E39A7C'
    }
  }, "COMMANDES OUVERTES")), dropStatus === 'closed' && /*#__PURE__*/React.createElement("p", {
    className: "font-serif italic text-sm w-full text-center",
    style: {
      opacity: 0.6
    }
  }, "Prochain drop \xE0 venir."))), /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1 mb-12 overflow-x-auto pb-1",
    style: {
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      WebkitOverflowScrolling: 'touch'
    }
  }, categories.map(cat => /*#__PURE__*/React.createElement("button", {
    key: cat,
    onClick: () => setActiveCategory(cat),
    className: "font-typewriter text-xs tracking-[0.3em] uppercase px-5 py-2.5 whitespace-nowrap transition-all duration-300",
    style: {
      borderRadius: '2px',
      border: '1px solid',
      borderColor: activeCategory === cat ? '#0F2865' : 'rgba(15,40,101,0.18)',
      backgroundColor: activeCategory === cat ? '#0F2865' : 'transparent',
      color: activeCategory === cat ? '#F4F1EC' : 'rgba(15,40,101,0.55)',
      cursor: 'pointer'
    }
  }, categoryLabels[cat] || cat)))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8"
  }, filteredProducts.map((p, i) => /*#__PURE__*/React.createElement(Reveal, {
    key: p.id,
    delay: i * 80
  }, /*#__PURE__*/React.createElement(ProductCard, {
    product: p,
    onAddToCart: addToCart,
    dropStatus: dropStatus,
    onOpenDetail: setDetailProduct
  })))))), /*#__PURE__*/React.createElement("section", {
    id: "histoire",
    className: "relative grain",
    style: {
      backgroundColor: '#0F2865',
      color: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-2 min-h-[640px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative aspect-[4/3] lg:aspect-auto lg:min-h-[640px] order-1 lg:order-1 overflow-hidden"
  }, /*#__PURE__*/React.createElement(CabaneTchanqueeScene, null), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-6 left-6 md:bottom-8 md:left-8 px-3 py-1.5",
    style: {
      backgroundColor: 'rgba(244,241,236,0.92)',
      color: '#0F2865'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[10px] md:text-xs tracking-[0.2em]"
  }, "BASSIN D'ARCACHON \xB7 \xC9T\xC9 25"))), /*#__PURE__*/React.createElement("div", {
    className: "histoire-text flex items-center order-2 lg:order-2 px-8 md:px-16 lg:px-20 py-14 md:py-20 lg:py-32"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("div", {
    className: "max-w-xl"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.4em] mb-6",
    style: {
      color: '#E39A7C'
    }
  }, "III. NOTRE HISTOIRE"), /*#__PURE__*/React.createElement("h2", {
    className: "font-serif-fine italic mb-10",
    style: {
      fontSize: 'clamp(1.8rem, 3.4vw, 2.8rem)',
      lineHeight: 1.2
    }
  }, "Une histoire de pont."), /*#__PURE__*/React.createElement("div", {
    className: "font-serif text-base md:text-lg space-y-6 leading-relaxed",
    style: {
      opacity: 0.88
    }
  }, /*#__PURE__*/React.createElement("p", null, "Typique est n\xE9e entre deux c\xF4tes. D'un c\xF4t\xE9, les Bouches-du-Rh\xF4ne : le mistral, la garrigue, les calanques. De l'autre, le bassin d'Arcachon : les cabanes tchanqu\xE9es, les pins, les vagues longues d'Hossegor."), /*#__PURE__*/React.createElement("p", null, "Au milieu, des amis, un \xE9t\xE9, une maison, et un mot qui revenait sans cesse dans la bouche de chacun\xA0: ", /*#__PURE__*/React.createElement("span", {
    className: "font-typewriter",
    style: {
      fontStyle: 'normal'
    }
  }, "typique"), ".")), /*#__PURE__*/React.createElement("div", {
    className: "mt-10"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-lg",
    style: {
      color: '#E39A7C'
    }
  }, "Deux c\xF4tes. Une seule \xE9vidence.")), /*#__PURE__*/React.createElement("div", {
    className: "mt-12 opacity-60"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[10px] tracking-[0.3em] uppercase"
  }, "Les Calanques \xB7 Les Landes"))))))), /*#__PURE__*/React.createElement("section", {
    className: "relative py-8 overflow-hidden",
    style: {
      backgroundColor: '#F4F1EC',
      borderTop: '1px solid rgba(15,40,101,0.08)',
      borderBottom: '1px solid rgba(15,40,101,0.08)'
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex animate-marquee whitespace-nowrap",
    style: {
      width: 'max-content'
    }
  }, [...lexique, ...lexique, ...lexique, ...lexique].map((mot, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "font-serif-fine italic mx-8 md:mx-14 text-2xl md:text-3xl",
    style: {
      color: i % 4 === 0 ? '#E39A7C' : '#0F2865',
      opacity: i % 4 === 0 ? 0.9 : 0.55
    }
  }, mot, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.4
    }
  }, "\xB7"))))), /*#__PURE__*/React.createElement("section", {
    id: "alertes",
    className: "relative py-28 md:py-40 px-6 grain",
    style: {
      backgroundColor: '#0F2865',
      color: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-2xl mx-auto text-center"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.4em] mb-6",
    style: {
      color: '#E39A7C'
    }
  }, "IV. ALERTES DROPS"), /*#__PURE__*/React.createElement("h2", {
    className: "font-serif-fine italic leading-tight mb-6",
    style: {
      fontSize: 'clamp(2rem,4.5vw,3.4rem)',
      color: '#F4F1EC'
    }
  }, "Ne rate pas", /*#__PURE__*/React.createElement("br", null), "le prochain drop."), /*#__PURE__*/React.createElement("p", {
    className: "font-serif text-base md:text-lg leading-relaxed mb-10",
    style: {
      opacity: 0.65
    }
  }, "Chaque drop dure quelques jours. Les pi\xE8ces partent vite.", ' ', "Laisse ton adresse, on t'\xE9crit d\xE8s que les commandes ouvrent."), /*#__PURE__*/React.createElement("div", {
    className: "mb-10 flex justify-center"
  }, /*#__PURE__*/React.createElement(WaveDivider, {
    color: "#F4F1EC",
    width: 120,
    strokeWidth: 1
  })), notifSubmitted ? /*#__PURE__*/React.createElement("div", {
    className: "py-8 px-10 text-center",
    style: {
      border: '1px solid rgba(244,241,236,0.15)',
      borderRadius: '2px',
      backgroundColor: 'rgba(244,241,236,0.05)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-sm tracking-wider uppercase mb-3",
    style: {
      color: '#E39A7C'
    }
  }, "\u2713 C'est not\xE9"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-base",
    style: {
      opacity: 0.7
    }
  }, "On t'envoie une alerte d\xE8s que le prochain drop ouvre.")) : /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      if (notifEmail.trim()) setNotifSubmitted(true);
    },
    className: "flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: notifEmail,
    onChange: e => setNotifEmail(e.target.value),
    placeholder: "ton@email.fr",
    required: true,
    className: "flex-1 font-serif text-base px-5 py-3.5",
    style: {
      border: '1px solid rgba(244,241,236,0.2)',
      borderRadius: '2px',
      backgroundColor: 'rgba(244,241,236,0.06)',
      color: '#F4F1EC',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn-terra px-6 py-3.5 font-typewriter text-xs tracking-widest uppercase whitespace-nowrap",
    style: {
      borderRadius: '2px'
    }
  }, "M'alerter \u2192")), /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-[10px] tracking-[0.25em] uppercase mt-6",
    style: {
      opacity: 0.35
    }
  }, "Aucun spam. Juste les drops.")))), /*#__PURE__*/React.createElement("footer", {
    className: "relative py-20 md:py-24 px-6 grain",
    style: {
      backgroundColor: '#0A1F3D',
      color: '#F4F1EC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-10"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-3xl mb-3"
  }, "typique"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-base mb-8",
    style: {
      opacity: 0.7
    }
  }, "entre sel et soleil"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs leading-loose",
    style: {
      color: '#E39A7C',
      opacity: 0.85
    }
  }, lexique.join(' · '))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.35em] uppercase mb-6",
    style: {
      opacity: 0.55
    }
  }, "Naviguer"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-3 font-serif text-base"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#pieces",
    className: "link-under"
  }, "Boutique")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#histoire",
    className: "link-under"
  }, "Notre histoire")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#alertes",
    className: "link-under"
  }, "Alertes drops")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLegalModal('mentions'),
    className: "link-under font-serif text-base",
    style: {
      background: 'none',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      padding: 0,
      opacity: 0.7
    }
  }, "Mentions l\xE9gales")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLegalModal('cgv'),
    className: "link-under font-serif text-base",
    style: {
      background: 'none',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      padding: 0,
      opacity: 0.7
    }
  }, "CGV")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setLegalModal('confidentialite'),
    className: "link-under font-serif text-base",
    style: {
      background: 'none',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      padding: 0,
      opacity: 0.7
    }
  }, "Confidentialit\xE9")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.35em] uppercase mb-6",
    style: {
      opacity: 0.55
    }
  }, "Suivre"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "https://www.instagram.com/typique.fr",
    target: "_blank",
    rel: "noopener noreferrer",
    className: "inline-flex items-center gap-3 font-serif text-base link-under"
  }, /*#__PURE__*/React.createElement(Instagram, {
    size: 16,
    strokeWidth: 1.5
  }), "@typique.fr")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "mailto:bonjour@typique.fr",
    className: "inline-flex items-center gap-3 font-serif text-base link-under"
  }, /*#__PURE__*/React.createElement(Mail, {
    size: 16,
    strokeWidth: 1.5
  }), "bonjour@typique.fr"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-10 max-w-xs"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-sm leading-relaxed",
    style: {
      opacity: 0.6
    }
  }, "Marque fran\xE7aise ind\xE9pendante.", /*#__PURE__*/React.createElement("br", null), "Pi\xE8ces produites en s\xE9rie limit\xE9e", /*#__PURE__*/React.createElement("br", null), "entre les Calanques et les Landes.")))), /*#__PURE__*/React.createElement("div", {
    className: "mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-4",
    style: {
      borderTop: '1px solid rgba(244,241,236,0.12)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-typewriter text-xs tracking-[0.25em]",
    style: {
      opacity: 0.6
    }
  }, "\xA9 typique 2026 \u2014 entre sel et soleil"), /*#__PURE__*/React.createElement("p", {
    className: "font-serif-fine italic text-xs",
    style: {
      opacity: 0.5
    }
  }, "[tchipik], \xE0 la proven\xE7ale.")))));
}

// ---------- Mount ----------
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(TypiqueSite, null));

// Cacher l'écran de chargement une fois React monté
(function () {
  var el = document.getElementById('loading-screen');
  if (el) {
    el.classList.add('hide');
    setTimeout(function () {
      el.style.display = 'none';
    }, 700);
  }
})();
