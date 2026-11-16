// Gera a cópia de visualização do Sistema Blatt para publicar como artefato do Claude.
// Junta visual, dados atuais, logo e ícones num arquivo só (o artefato não busca arquivos de fora).
// Uso: node scripts/artefato.mjs   ->  dist-artefato/sistema-blatt.html
// Demo pública com dados fictícios: npm run demo   ->  docs/demo/index.html (BLATT_DADOS, BLATT_SAIDA e BLATT_DEMO)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = process.env.BLATT_DEMO === '1';
const OUT = path.resolve(ROOT, process.env.BLATT_SAIDA || 'dist-artefato');
const ARQUIVO = DEMO ? 'index.html' : 'sistema-blatt.html';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'), ['src/main.js', '--bundle', '--format=esm', '--minify', '--target=es2022',
  '--define:__RO__=true', '--outfile=' + path.join(OUT, 'app.js'), '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' });

let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch {}
const DADOS = path.resolve(ROOT, process.env.BLATT_DADOS || cfg.dados || 'dados');
const nodes = fs.readdirSync(path.join(DADOS, 'nos')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(DADOS, 'nos', f), 'utf8')));

const dias = {};
const DIAS = path.join(DADOS, 'dias');
if (fs.existsSync(DIAS)) for (const f of fs.readdirSync(DIAS)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) { const d = JSON.parse(fs.readFileSync(path.join(DIAS, f), 'utf8')); dias[d.date] = d; }

// fotos viram arquivos publicados junto; PDFs e outros anexos aparecem só pelo nome
const fotos = [];
for (const n of nodes) for (const f of n.files || []) if (f.kind === 'foto') {
  const src = path.join(DADOS, 'anexos', n.id, f.file);
  if (!fs.existsSync(src)) continue;
  const rel = path.posix.join('anexos', n.id, f.file);
  fs.mkdirSync(path.join(OUT, 'anexos', n.id), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, rel));
  fotos.push(rel);
}

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*src="\/?app\.js"[^>]*><\/script>/, '');
const woff2 = fs.readFileSync(path.join(ROOT, 'public/vendor/icones/Phosphor-Light.woff2')).toString('base64');
const icons = fs.readFileSync(path.join(ROOT, 'public/vendor/icones/style.css'), 'utf8')
  .replace(/src:\s*url\("\.\/Phosphor-Light\.woff2"\) format\("woff2"\),\s*url\("\.\/Phosphor-Light\.woff"\) format\("woff"\);/, `src: url(data:font/woff2;base64,${woff2}) format("woff2");`);
const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
const logo = fs.readFileSync(path.join(ROOT, 'public/marca/blatt-logo.svg'), 'utf8');
const js = fs.readFileSync(path.join(OUT, 'app.js'), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const foto = DEMO ? 'dados fictícios' : new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');

const page = `${DEMO ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' : ''}<title>${DEMO ? 'Sistema Blatt: demonstração' : 'Sistema Blatt'}</title>
<style>
${icons}
${css}
</style>
${body}
<script>window.__BLATT_DADOS__=${json(nodes)};window.__BLATT_LOGO__=${json(logo)};window.__BLATT_FOTO__=${json(foto)};window.__BLATT_DIAS__=${json(dias)};</script>
<script type="module">${safe(js)}</script>
`;
fs.writeFileSync(path.join(OUT, ARQUIVO), page);
fs.rmSync(path.join(OUT, 'app.js'));
console.log(JSON.stringify({ arquivo: path.join(OUT, ARQUIVO), blocos: nodes.length, fotos, kb: Math.round(page.length / 1024) }));
