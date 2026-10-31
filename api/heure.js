// Heure du serveur, lue par le site (voir design_handoff_typique_site/horloge.js).
// Le site décide d'ouvrir et de fermer le drop d'après cette heure, pas d'après celle du téléphone du visiteur.
// Jamais mise en cache : une heure en cache serait fausse.
module.exports = function heure(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify({ t: Date.now() }));
};
