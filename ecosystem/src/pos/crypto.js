'use strict';
// Krypterer integrationstokens i hvile (AES-256-GCM). Nøglen kommer fra
// miljøvariablen TOKEN_ENCRYPTION_KEY (32 bytes, base64) og må aldrig ligge i
// frontend eller i repoet.
const crypto = require('node:crypto');

function loadKey(b64) {
  if (!b64) throw new Error('TOKEN_ENCRYPTION_KEY mangler');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY skal være 32 bytes (base64)');
  return key;
}

function createVault(keyB64) {
  const key = loadKey(keyB64);
  return {
    seal(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${data.toString('base64')}`;
    },
    open(sealed) {
      const [v, iv, tag, data] = String(sealed).split('.');
      if (v !== 'v1') throw new Error('Ukendt krypteringsformat');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
    },
  };
}

const newKey = () => crypto.randomBytes(32).toString('base64');
module.exports = { createVault, newKey };
