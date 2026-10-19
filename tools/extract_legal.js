// Extrait LEGAL_CONTENT du JSX (objet de textes) et l'imprime en JSON.
// Usage : jsc tools/extract_legal.js -- <typique-site.jsx>
var src = readFile(arguments[0]);
var start = src.indexOf('const LEGAL_CONTENT = ');
var end = src.indexOf('\n};\n', start);
if (start < 0 || end < 0) throw new Error('LEGAL_CONTENT introuvable');
var obj = (0, eval)('(' + src.slice(start + 'const LEGAL_CONTENT = '.length, end + 2) + ')');
print(JSON.stringify(obj));
