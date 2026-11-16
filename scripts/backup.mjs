// Backup diário: copia o banco e os anexos do Supabase para dados/, que vai para o GitHub.
// Roda sozinho todo dia pelo GitHub Actions (.github/workflows/backup.yml) e também à mão: node scripts/backup.mjs
// Endereço e chave vêm de SUPABASE_URL e SUPABASE_CHAVE ou, no computador, do config.json.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase, anexoKey } from '../supabase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch {}
const url = process.env.SUPABASE_URL || cfg.supabase?.url;
const chave = process.env.SUPABASE_CHAVE || cfg.supabase?.chave;
if (!url || !chave) { console.log('Supabase não configurado: nada para copiar.'); process.exit(0); }

const DADOS = path.join(ROOT, 'dados');
const sb = supabase({ url, chave });
const json = v => JSON.stringify(v, null, 2);

// escreve só o que mudou, e tira da pasta o que não existe mais no banco
async function mirror(dir, files) {
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, text] of files) {
    const f = path.join(dir, name);
    if (!fs.existsSync(f) || await fsp.readFile(f, 'utf8') !== text) await fsp.writeFile(f, text);
  }
  const keep = new Set(files.map(([n]) => n));
  for (const f of await fsp.readdir(dir)) if (f.endsWith('.json') && !keep.has(f)) await fsp.rm(path.join(dir, f));
}

const nos = (await sb.db.select('nos', 'select=data')).map(r => r.data);
await mirror(path.join(DADOS, 'nos'), nos.map(n => [n.id + '.json', json(n)]));
const dias = (await sb.db.select('dias', 'select=data')).map(r => r.data);
await mirror(path.join(DADOS, 'dias'), dias.map(d => [d.date + '.json', json(d)]));
const lixeira = await sb.db.select('lixeira', 'select=*&order=id');
await fsp.mkdir(path.join(DADOS, 'lixeira'), { recursive: true });
await fsp.writeFile(path.join(DADOS, 'lixeira', 'registro.json'), json(lixeira));

// anexos: os arquivos nunca mudam depois de enviados, então só baixa os que ainda não estão aqui.
// Nomes sempre na forma NFC: o Mac grava acentos assim no Git, e no Linux "ó" em NFD seria outro arquivo.
let baixados = 0, falhas = 0;
const keep = new Map(); // bloco -> nomes dos anexos atuais
for (const n of nos) for (const f of n.files || []) {
  const name = f.file.normalize('NFC');
  if (!keep.has(n.id)) keep.set(n.id, new Set());
  keep.get(n.id).add(name);
  const dest = path.join(DADOS, 'anexos', n.id, name);
  if (fs.existsSync(dest)) continue;
  const r = await sb.storage.download(anexoKey(n.id, f.file));
  if (!r.ok) { falhas++; console.warn('Não baixou', n.id, f.name, r.status); continue; }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  baixados++;
}
const anexosDir = path.join(DADOS, 'anexos');
// tira o que não é mais anexo de nenhum bloco (incluindo cópias com o nome em outra forma de acento)
if (fs.existsSync(anexosDir)) for (const d of await fsp.readdir(anexosDir)) {
  const dir = path.join(anexosDir, d);
  if (!keep.has(d)) { if (d !== '.gitkeep') await fsp.rm(dir, { recursive: true, force: true }); continue; }
  for (const f of await fsp.readdir(dir)) if (!keep.get(d).has(f)) await fsp.rm(path.join(dir, f), { force: true });
}

console.log(`Backup: ${nos.length} blocos, ${dias.length} dias, ${lixeira.length} itens na lixeira, ${baixados} anexos novos${falhas ? `, ${falhas} falharam` : ''}.`);
if (falhas) process.exitCode = 1;
