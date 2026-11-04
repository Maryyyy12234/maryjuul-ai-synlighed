const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const name of ['styles.css', 'app.js']) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex').slice(0, 12);
  html = html.replace(new RegExp('/' + name.replace('.', '\\.') + '(?:\\?v=[a-z0-9-]+)?', 'g'), '/' + name + '?v=' + hash);
}
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'favicon.svg']) {
  fs.copyFileSync(path.join(root, name), path.join(root, 'dist', name));
}
fs.cpSync(path.join(root, 'assets'), path.join(root, 'dist/assets'), { recursive: true });
console.log('Static site prepared with versioned CSS and JavaScript.');
