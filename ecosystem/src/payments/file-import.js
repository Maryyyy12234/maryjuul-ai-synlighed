'use strict';
// Sikker import af betalingsrapporter (CSV) med forhåndsvisning, kolonnetilknytning,
// validering, dubletkontrol og fejlrapport. Bruges til Nets/MyNets og andre udbydere
// uden API. Ukortlagte kolonner gemmes ALDRIG (dataminimering).
//
// Kortdata: Kolonner, hvis navn tyder på kortnummer/CVV/PIN, kan ikke vælges. Værdier,
// der ligner et rigtigt kortnummer (13–19 cifre og gyldigt Luhn-tjek), afviser rækken.

const crypto = require('node:crypto');
const { parseApiAmount, MoneyError } = require('../money');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100000;

// ---------- CSV ----------
function detectDelimiter(firstLine) {
  const counts = [';', ',', '\t', '|'].map((d) => [d, firstLine.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const d = detectDelimiter(firstLine);
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (q) throw new Error('Filen har et citationstegn, der ikke bliver lukket');
  return { delimiter: d, header: (clean.shift() || []).map((h) => h.trim()), rows: clean.map((r) => r.map((c) => c.trim())) };
}

// ---------- Værdier ----------
function parseAmount(v) {
  let s = String(v ?? '').replace(/\s|kr\.?|dkk/gi, '');
  if (!s) throw new MoneyError('Beløb mangler');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');           // 1.234,56
  else if (lastDot > lastComma && lastComma !== -1) s = s.replace(/,/g, '');      // 1,234.56
  else if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234
  const ore = parseApiAmount(s);
  return neg ? -ore : ore;
}
// Datoer: 2026-11-05, 05-11-2026, 05.11.2026, 05/11/2026 (dag først, dansk), evt. med tid.
function parseDateTime(dateStr, timeStr = '') {
  const s = `${dateStr ?? ''} ${timeStr ?? ''}`.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  let y, mo, d, h = 0, mi = 0, se = 0;
  if (m) [, y, mo, d, h = 0, mi = 0, se = 0] = m;
  else if ((m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/.exec(s))) [, d, mo, y, h = 0, mi = 0, se = 0] = m;
  else throw new Error(`Ukendt datoformat: "${s}"`);
  [y, mo, d, h, mi, se] = [y, mo, d, h, mi, se].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) throw new Error(`Ugyldig dato: "${s}"`);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCDate() !== d) throw new Error(`Datoen findes ikke: "${s}"`);
  return { y, mo, d, h, mi, se, hasTime: m[4] !== undefined && m[4] !== null };
}
// Lokal tid (fx Europe/Copenhagen) -> UTC ISO
function toUtcIso(p, tz) {
  const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.se);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asLocal - guess)).toISOString();
}

// ---------- PCI: kortdata må aldrig ind ----------
const BLOCKED_HEADER = /(kort\s*-?nr|kortnummer|card\s*number|card\s*no|\bpan\b|cvv|cvc|cvn|\bpin\b|track|magnet|expiry|udløb)/i;
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
const looksLikePan = (v) => { const d = String(v).replace(/[\s-]/g, ''); return /^\d{13,19}$/.test(d) && luhn(d); };

// ---------- Kolonnetilknytning ----------
const FIELDS = {
  transaction_ref: { label: 'Transaktionsreference', required: true, aliases: ['transaktions-id', 'transaktionsid', 'transaktionsnr', 'transaction id', 'transaction reference', 'reference', 'ref', 'arn', 'kvitteringsnr', 'transaction code'] },
  date: { label: 'Dato', required: true, aliases: ['dato', 'transaktionsdato', 'date', 'transaction date', 'købsdato', 'tidspunkt'] },
  time: { label: 'Klokkeslæt', aliases: ['tid', 'klokkeslæt', 'time', 'kl.'] },
  amount: { label: 'Beløb', required: true, aliases: ['beløb', 'transaktionsbeløb', 'amount', 'bruttobeløb', 'gross amount', 'købsbeløb'] },
  currency: { label: 'Valuta', aliases: ['valuta', 'currency', 'møntsort'] },
  type: { label: 'Type', aliases: ['type', 'transaktionstype', 'transaction type'] },
  status: { label: 'Status', aliases: ['status'] },
  terminal_id: { label: 'Terminal', aliases: ['terminal', 'terminal-id', 'terminalid', 'terminal id', 'tid nr', 'pos id'] },
  merchant_account: { label: 'Forretningsnummer', aliases: ['forretningsnr', 'forretningsnummer', 'indløsningsnr', 'merchant id', 'mid', 'aftalenummer'] },
  card_scheme: { label: 'Korttype', aliases: ['korttype', 'kortart', 'card type', 'card brand', 'betalingskort', 'scheme'] },
  fee: { label: 'Gebyr', aliases: ['gebyr', 'gebyrer', 'fee', 'fees', 'commission', 'kommission', 'serviceafgift'] },
  net_amount: { label: 'Nettobeløb', aliases: ['nettobeløb', 'net amount', 'netto', 'afregnet beløb'] },
  payout_date: { label: 'Udbetalingsdato', aliases: ['udbetalingsdato', 'afregningsdato', 'settlement date', 'payout date', 'valørdato', 'bogføringsdato'] },
  payout_ref: { label: 'Udbetalingsreference', aliases: ['afregningsnr', 'afregningsreference', 'udbetalingsreference', 'settlement id', 'payout reference', 'batch'] },
};
const norm = (s) => s.toLowerCase().replace(/[_]/g, ' ').replace(/\s+/g, ' ').trim();

function suggestMapping(header) {
  const map = {};
  for (const [field, f] of Object.entries(FIELDS)) {
    const idx = header.findIndex((h, i) => !BLOCKED_HEADER.test(h) && !Object.values(map).includes(i) && f.aliases.includes(norm(h)));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

const TYPE_WORDS = { payment: /(køb|salg|purchase|sale|payment|betaling|debit)/i, refund: /(retur|refund|kreditering|credit)/i, chargeback: /(chargeback|charge back|tilbageførsel|indsigelse)/i };
const STATUS_WORDS = { successful: /(godkendt|gennemført|approved|success|ok|completed|afregnet|settled)/i, failed: /(afvist|declined|fejl|failed|rejected)/i, cancelled: /(annuller|cancel|void)/i, pending: /(afventer|pending)/i };
const SCHEMES = [['VISA_DANKORT', /visa\s*[/-]?\s*dankort|dankort\s*[/-]?\s*visa/i], ['DANKORT', /dankort/i], ['VISA', /visa/i], ['MASTERCARD', /master/i], ['MAESTRO', /maestro/i], ['AMEX', /amex|american/i], ['MOBILEPAY', /mobilepay/i]];

function classify(map, cells) { const v = map.type != null ? cells[map.type] : ''; for (const [k, re] of Object.entries(TYPE_WORDS)) if (re.test(v)) return k; return null; }

// Gør en fil klar: parse + forslag + forhåndsvisning. Intet gemmes.
function prepare(text, { mapping = null, timezone = 'Europe/Copenhagen', defaultCurrency = 'DKK' } = {}) {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Filen er for stor (maks. 10 MB)');
  if (/\u0000/.test(text)) throw new Error('Filen ser ikke ud til at være en tekstfil (CSV). XLSX og XML understøttes ikke endnu – gem som CSV.');
  const { delimiter, header, rows } = parseCsv(text);
  if (!header.length || !rows.length) throw new Error('Filen er tom eller mangler en overskriftsrække');
  if (rows.length > MAX_ROWS) throw new Error(`Filen har for mange rækker (maks. ${MAX_ROWS})`);
  const blocked = header.map((h, i) => (BLOCKED_HEADER.test(h) ? i : -1)).filter((i) => i >= 0);
  const map = mapping || suggestMapping(header);
  for (const [f, i] of Object.entries(map)) {
    if (!FIELDS[f]) throw new Error(`Ukendt felt: ${f}`);
    if (blocked.includes(i)) throw new Error(`Kolonnen "${header[i]}" kan indeholde kortdata og kan ikke importeres`);
    if (i < 0 || i >= header.length) throw new Error(`Kolonne findes ikke for ${FIELDS[f].label}`);
  }
  const missing = Object.entries(FIELDS).filter(([f, d]) => d.required && map[f] == null).map(([, d]) => d.label);
  const valid = [], errors = [];
  const seen = new Map();
  if (!missing.length) rows.forEach((cells, i) => {
    const line = i + 2;
    try {
      for (const idx of Object.values(map)) if (looksLikePan(cells[idx])) throw new Error('Rækken indeholder noget, der ligner et kortnummer. Rækken er afvist og ikke gemt.');
      const ref = cells[map.transaction_ref];
      if (!ref) throw new Error('Transaktionsreference mangler');
      if (ref.length > 100) throw new Error('Transaktionsreference er for lang');
      const when = parseDateTime(cells[map.date], map.time != null ? cells[map.time] : '');
      const amount = parseAmount(cells[map.amount]);
      if (amount === 0) throw new Error('Beløb er 0');
      const currency = (map.currency != null && cells[map.currency] ? cells[map.currency] : defaultCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Ugyldig valuta: "${currency}"`);
      let type = classify(map, cells) || (amount < 0 ? 'refund' : 'payment');
      let status = 'successful';
      if (map.status != null) { status = null; for (const [k, re] of Object.entries(STATUS_WORDS)) if (re.test(cells[map.status])) { status = k; break; } if (!status) throw new Error(`Ukendt status: "${cells[map.status]}"`); }
      const schemeRaw = map.card_scheme != null ? cells[map.card_scheme] : '';
      const scheme = (SCHEMES.find(([, re]) => re.test(schemeRaw)) || ['OTHER'])[0];
      const fee = map.fee != null && cells[map.fee] ? Math.abs(parseAmount(cells[map.fee])) : null;
      const net = map.net_amount != null && cells[map.net_amount] ? parseAmount(cells[map.net_amount]) : null;
      const payoutDate = map.payout_date != null && cells[map.payout_date] ? parseDateTime(cells[map.payout_date]) : null;
      const rec = {
        line, external_ref: ref, type, status, amount_ore: Math.abs(amount), currency,
        occurred_at: toUtcIso(when, timezone), time_known: when.hasTime,
        terminal_external_id: map.terminal_id != null ? cells[map.terminal_id] || null : null,
        merchant_account: map.merchant_account != null ? cells[map.merchant_account] || null : null,
        card_scheme: schemeRaw ? scheme : null, fee_ore: fee, net_ore: net,
        payout_date: payoutDate ? `${payoutDate.y}-${String(payoutDate.mo).padStart(2, '0')}-${String(payoutDate.d).padStart(2, '0')}` : null,
        payout_ref: map.payout_ref != null ? cells[map.payout_ref] || null : null,
      };
      const key = `${type}|${ref}`;
      if (seen.has(key)) throw new Error(`Dublet i filen (samme reference som linje ${seen.get(key)})`);
      seen.set(key, line);
      valid.push(rec);
    } catch (e) { errors.push({ line, error: e.message }); }
  });
  return {
    delimiter, header, mapping: map, suggested: !mapping, blockedColumns: blocked.map((i) => header[i]),
    missingRequired: missing, rowCount: rows.length, valid, errors,
    preview: valid.slice(0, 10),
    fileHash: crypto.createHash('sha256').update(text).digest('hex'),
    fields: Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, { label: v.label, required: !!v.required }])),
  };
}

module.exports = { prepare, parseCsv, parseAmount, parseDateTime, toUtcIso, looksLikePan, luhn, suggestMapping, FIELDS, BLOCKED_HEADER };
