// Horloge de confiance du site : l'heure du SERVEUR, pas celle du téléphone (qui peut être fausse).
// Copiée telle quelle dans l'accueil et dans /apercu/ par tools/build.py.
//
//   HORLOGE.maintenant()       heure actuelle en millisecondes (comme Date.now())
//   HORLOGE.source             'serveur' | 'appareil' (serveur injoignable) | 'simulee' (essais en local)
//   HORLOGE.synchro            promesse résolue quand la première synchronisation est terminée
//   HORLOGE.synchroniser()     redemande l'heure au serveur (au plus une fois toutes les 20 s)
//   HORLOGE.surChangement(f)   f() est appelée quand l'écart avec l'appareil change de plus d'une seconde
//
// Heure du serveur, par ordre de préférence :
//   1. /api/heure (fonction Vercel, api/heure.js), précise à la milliseconde ;
//   2. l'en-tête « Date » de la réponse à une requête HEAD sur le site, précis à la seconde ;
//   3. l'heure de l'appareil, faute de mieux (hors connexion, par exemple).
//
// Essais en local seulement : ?simuler=2026-11-06 11:59:50 (heure de Paris) fait partir l'horloge de cette heure.
// Sur le site en ligne ce réglage est ignoré, sinon n'importe qui pourrait acheter avant l'heure.
(function () {
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var ecart = 0;              // heure du serveur moins heure de l'appareil, en ms
  var source = 'appareil';
  var derniere = 0;           // dernière synchronisation (heure de l'appareil)
  var enCours = null;
  var ecouteurs = [];

  // « 2026-11-06 11:59:50 » (heure de Paris) → millisecondes. null si illisible.
  function parisEnMs(texte) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texte || '');
    if (!m) return null;
    var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    function decalage(t) { // avance de Paris sur UTC à l'instant t (1 h l'hiver, 2 h l'été)
      var p = {};
      fmt.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = +x.value; });
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
    }
    return utc - decalage(utc - decalage(utc));
  }

  function avec(delaiMs, promesse) { // échoue si la réponse tarde trop
    return new Promise(function (ok, ko) {
      var t = setTimeout(function () { ko(new Error('trop long')); }, delaiMs);
      promesse.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); ko(e); });
    });
  }

  function viaFonction() {
    var t0 = Date.now();
    return avec(2500, fetch('/api/heure', { cache: 'no-store' })).then(function (r) {
      if (!r.ok) throw new Error('api/heure ' + r.status);
      return r.json();
    }).then(function (j) {
      if (typeof j.t !== 'number') throw new Error('réponse inattendue');
      var t1 = Date.now();
      return j.t + (t1 - t0) / 2 - t1;          // le serveur a répondu à mi-chemin de l'aller-retour
    });
  }

  function viaEntete() {
    var t0 = Date.now();
    return avec(2500, fetch('/?h=' + t0, { method: 'HEAD', cache: 'no-store' })).then(function (r) {
      var d = Date.parse(r.headers.get('Date'));
      if (isNaN(d)) throw new Error('pas d\'en-tête Date');
      var t1 = Date.now();
      return d + 500 + (t1 - t0) / 2 - t1;      // l'en-tête est tronqué à la seconde : +0,5 s en moyenne
    });
  }

  function appliquer(nouvelEcart, nouvelleSource) {
    var avant = ecart;
    ecart = nouvelEcart;
    source = nouvelleSource;
    if (Math.abs(ecart - avant) > 1000) ecouteurs.slice().forEach(function (f) { try { f(); } catch (e) {} });
  }

  var simule = local && /[?&]simuler=([^&]*)/.exec(location.search);
  var HORLOGE = {
    maintenant: function () { return Date.now() + ecart; },
    get source() { return source; },
    surChangement: function (f) {
      ecouteurs.push(f);
      return function () { ecouteurs = ecouteurs.filter(function (x) { return x !== f; }); };
    },
    parisEnMs: parisEnMs
  };

  if (simule) {
    var depart = parisEnMs(decodeURIComponent(simule[1].replace(/\+/g, ' ')));
    if (depart === null) console.warn('?simuler= illisible, attendu : 2026-11-06 11:59:50');
    else { ecart = depart - Date.now(); source = 'simulee'; }
    HORLOGE.synchroniser = function () { return Promise.resolve(); };
    HORLOGE.synchro = Promise.resolve();
  } else {
    HORLOGE.synchroniser = function () {
      if (enCours) return enCours;
      if (derniere && Date.now() - derniere < 20000) return Promise.resolve();
      enCours = viaFonction().then(function (e) { appliquer(e, 'serveur'); }, function () {
        return viaEntete().then(function (e) { appliquer(e, 'serveur'); }, function () {
          if (source !== 'serveur') appliquer(0, 'appareil'); // on garde la dernière heure du serveur si on l'a eue
        });
      }).then(function () { derniere = Date.now(); enCours = null; });
      return enCours;
    };
    HORLOGE.synchro = HORLOGE.synchroniser();
    // Un téléphone qui se réveille : on vérifie l'heure à nouveau.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) HORLOGE.synchroniser();
    });
  }
  window.HORLOGE = HORLOGE;
})();
