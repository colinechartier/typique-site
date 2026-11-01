// Extrait LEGAL_CONTENT du JSX (objet de textes) et l'imprime en JSON.
// Les textes citent FRAIS_COLISSIMO et EMAIL_CONTACT : leurs lignes `const` sont lues avec l'objet.
// Usage : jsc tools/extract_legal.js -- <typique-site.jsx>
var src = readFile(arguments[0]);
var start = src.indexOf('const LEGAL_CONTENT = ');
var end = src.indexOf('\n};\n', start);
if (start < 0 || end < 0) throw new Error('LEGAL_CONTENT introuvable');
var constantes = (src.match(/^const (FRAIS_COLISSIMO|EMAIL_CONTACT) = .*;$/gm) || []).join('\n');
if (constantes.split('\n').length !== 2) throw new Error('FRAIS_COLISSIMO et EMAIL_CONTACT introuvables');
var obj = (0, eval)(constantes + '\n(' + src.slice(start + 'const LEGAL_CONTENT = '.length, end + 2) + ')');
print(JSON.stringify(obj));
