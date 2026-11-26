// Pakker index.html (Artifact-format uden <html>/<head>) til en selvstændig side i dist/.
// Titel, description og robots (noindex) står i index.html – én kilde, ingen dubletter.
// Opdaterer også listen over billedfiler i index.html, så nye produktbilleder vises automatisk.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const srcPath = path.join(root, 'index.html');
const assets = fs.readdirSync(path.join(root, 'assets')).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
let body = fs.readFileSync(srcPath, 'utf8');
const listed = body.replace(/\/\*ASSETS\*\/[\s\S]*?\/\*\/ASSETS\*\//, '/*ASSETS*/' + JSON.stringify(assets) + '/*/ASSETS*/');
if (listed !== body) { body = listed; fs.writeFileSync(srcPath, body); }
const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="assets/logo.png">
<link rel="preload" as="image" href="assets/noir-m2.jpg" fetchpriority="high">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
fs.cpSync(path.join(root, 'assets'), path.join(root, 'dist', 'assets'), { recursive: true });
console.log(`DUO STUDIO bygget til duo-studio/dist/ (${assets.length} billedfiler registreret)`);
