// Compile le JSX en JS via Babel standalone, exécuté par JavaScriptCore (jsc).
// Usage : jsc tools/compile.js -- <babel.min.js> <entrée.jsx>  → JS compilé sur stdout
var babelPath = arguments[0];
var jsxPath = arguments[1];
// jsc n'a pas de console : Babel en a besoin au chargement.
var console = { log: function () {}, warn: function () {}, error: function () {}, debug: function () {}, info: function () {} };
load(babelPath);
var out = Babel.transform(readFile(jsxPath), { presets: ['react'] }).code;
print(out);
