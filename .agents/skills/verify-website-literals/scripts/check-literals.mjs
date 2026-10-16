#!/usr/bin/env node
// Comprueba que la web pública contiene, carácter por carácter, los textos
// literales de docs/CONTEXT-hito1-website.md y el JSON-LD sin cambios.
// Uso: node .agents/skills/verify-website-literals/scripts/check-literals.mjs [dirWeb]
// dirWeb por defecto: uis/website/dist si existe; si no, uis/website.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourcePath = join(repoRoot, 'docs/CONTEXT-hito1-website.md');
const defaultDir = existsSync(join(repoRoot, 'uis/website/dist'))
  ? join(repoRoot, 'uis/website/dist')
  : join(repoRoot, 'uis/website');
const webDir = resolve(process.argv[2] ?? defaultDir);

// ---------- Lectura de la fuente ----------
const md = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');

function section(title) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, '').startsWith(title));
  if (start === -1) throw new Error(`Sección no encontrada en la fuente: "${title}"`);
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && /^#{2,3} /.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

const clean = (s) =>
  s
    .replace(/\*\*/g, '')
    .replace(/<([^>\s]+@[^>\s]+)>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => clean(m[1]));
const listItems = (text) =>
  text
    .split('\n')
    .map((l) => l.match(/^\s*(?:\d+\.|-)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => clean(m[1]));
const afterColon = (s) => s.slice(s.indexOf(':') + 1).trim();

const landing = [];
const form = [];

landing.push(...afterColon(listItems(section('Header')).find((l) => l.startsWith('Navegación'))).split('|').map((s) => s.trim()));
landing.push(...quoted(section('Hero')));
landing.push(...listItems(section('Servicios')));
landing.push(...listItems(section('Por qué Nexova')));
landing.push(...listItems(section('Contacto')).map(afterColon));
for (const item of listItems(section('Footer'))) landing.push(...item.split('|').map((s) => s.trim()));

for (const row of section('Campos del formulario').split('\n')) {
  const cols = row.split('|').map((c) => c.trim());
  if (cols[2] === 'select' || cols[2] === 'radio') form.push(...cols[3].split(' / ').map((s) => s.trim()));
}
for (const msg of quoted(section('Mensajes de error esperados'))) {
  // "(quedan X)": X es dinámico, se verifica solo el prefijo.
  form.push(msg.includes('(quedan X)') ? msg.slice(0, msg.indexOf('X)')) : msg);
}
form.push(
  ...section('Mensaje de éxito')
    .split('\n')
    .filter((l) => /^>\s*\S/.test(l))
    .map((l) => clean(l.replace(/^>\s*/, ''))),
);
form.push(...quoted(section('Restricción específica')));

const schemaSource = JSON.parse(section('Schema.org').match(/```json\n([\s\S]*?)```/)[1]);

// ---------- Lectura de la web ----------
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(webDir);
const pick = (name) => files.filter((f) => basename(f) === name).sort((a, b) => a.length - b.length)[0];
const indexFile = pick('index.html');
const applicationFile = pick('application.html');
if (!indexFile || !applicationFile) {
  console.error(`✗ No se encontraron index.html y application.html en ${webDir}`);
  process.exit(1);
}

const entities = { '&amp;': '&', '&nbsp;': ' ', '&iquest;': '¿', '&iexcl;': '¡', '&copy;': '©', '&quot;': '"', '&#39;': "'" };
const htmlText = (html) =>
  clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, (e) => entities[e] ?? e),
  );

const indexHtml = readFileSync(indexFile, 'utf8');
const landingCorpus = htmlText(indexHtml);
const formCorpus = [htmlText(readFileSync(applicationFile, 'utf8')), ...files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8'))].join('\n');

// ---------- Comprobación ----------
let failures = 0;
function check(label, literals, corpus) {
  console.log(`\n${label}`);
  for (const lit of literals) {
    const ok = corpus.includes(lit);
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${lit}`);
  }
}
check(`Landing (${indexFile})`, landing, landingCorpus);
check(`Formulario (${applicationFile} + *.js)`, form, formCorpus);

const ld = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
const schemaOk = Boolean(ld) && isDeepStrictEqual(JSON.parse(ld[1]), schemaSource);
if (!schemaOk) failures++;
console.log(`\nSchema.org JSON-LD\n  ${schemaOk ? '✓ idéntico a la fuente' : '✗ ausente o distinto de la fuente'}`);

console.log(`\n${failures === 0 ? 'OK' : 'FALLO'}: ${landing.length + form.length + 1 - failures}/${landing.length + form.length + 1} comprobaciones`);
process.exit(failures === 0 ? 0 : 1);
