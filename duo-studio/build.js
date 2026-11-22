// Pakker index.html (Artifact-format uden <html>/<head>) til en selvstændig side i dist/.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const body = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
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
console.log('DUO STUDIO bygget til duo-studio/dist/');
