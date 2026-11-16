// Mapa da Blatt: servidor. Roda no computador (atalho) ou na Vercel.
// Os dados ficam no Supabase (banco + arquivos), com backup diário no GitHub.
// Enquanto o Supabase não estiver conectado, ficam em dados/ (com "github": true no config.json, cada mudança vira um commit no GitHub).
// Com senha definida (BLATT_SENHA), nada é lido nem gravado sem entrar; na Vercel a senha é obrigatória.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { supabase, anexoKey, SQL } from './supabase.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MODULES = path.join(ROOT, 'node_modules');
const CONFIG = path.join(ROOT, 'config.json');

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
const DADOS = path.resolve(ROOT, process.env.BLATT_DADOS || cfg.dados || 'dados');
const NOS = path.join(DADOS, 'nos');
const ANEXOS = path.join(DADOS, 'anexos');
const DIAS = path.join(DADOS, 'dias'); // tarefas do dia: um arquivo por data
const PORT = Number(process.env.PORT || cfg.porta || 4747);
const MAX_UPLOAD = 80 * 1024 * 1024;
const NUVEM = !!process.env.VERCEL; // na Vercel: sem disco gravável, sem conexões longas
const env = process.env;
// endereço e chave do Supabase: variáveis de ambiente (Vercel) ou config.json (computador)
const SUPA = {
  url: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || cfg.supabase?.url || '',
  chave: env.SUPABASE_CHAVE || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || cfg.supabase?.chave || '',
};
const SENHA = env.BLATT_SENHA || cfg.senha || '';

try { for (const d of [NOS, ANEXOS, DIAS]) fs.mkdirSync(d, { recursive: true }); } catch { /* disco só de leitura (Vercel) */ }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.heic': 'image/heic', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.zip': 'application/zip',
  '.ai': 'application/postscript', '.eps': 'application/postscript', '.psd': 'image/vnd.adobe.photoshop',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const mimeOf = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const validId = id => typeof id === 'string' && ID_RE.test(id);
const nodeFile = id => path.join(NOS, id + '.json');

// Caminho seguro: nunca sai da pasta base.
function inside(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

// No Windows, o antivírus às vezes segura o arquivo por um instante; tenta de novo.
async function retry(fn, tries = 6) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; await new Promise(r => setTimeout(r, 80 * (i + 1))); }
  }
}
const move = (a, b) => retry(() => fsp.rename(a, b));

async function writeAtomic(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, data);
  await move(tmp, file);
}

// Nome de arquivo que vale no Mac e no Windows.
function safeName(s) {
  let n = String(s || 'arquivo').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 150);
  if (!n || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = 'arquivo-' + n;
  return n;
}

const ALLOWED = ['socios', 'parent', 'title', 'description', 'notes', 'owner', 'status', 'checklist', 'links', 'files', 'order', 'colorIndex', 'cover', 'plan', 'pos', 'boardOrder'];
function clean(patch) {
  const o = {};
  for (const k of ALLOWED) if (k in patch) o[k] = patch[k];
  if ('socios' in o) o.socios = (Array.isArray(o.socios) ? o.socios : []).slice(0, 2).map(v => String(v || '').trim().slice(0, 40));
  return o;
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function body(req, limit = 2 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('grande demais'), { code: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

function slug(s) {
  return String(s || 'bloco').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bloco';
}

const trashStamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------- eventos ao vivo (SSE) ----------
const clients = new Set();
function broadcast(evt) {
  const msg = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients) c.write(msg);
  if (['no', 'dia', 'removido'].includes(evt.type) && store.kind === 'arquivos') scheduleSync();
}

// ---------- armazenamento em arquivos (antes de conectar o Supabase) ----------
const selfWrites = new Map(); // arquivo -> instante, para não ecoar nossa própria escrita como "mudança externa"
const markSelf = abs => selfWrites.set(path.relative(DADOS, abs), Date.now());
let watchTimer = null;
if (!NUVEM) try {
  fs.watch(DADOS, { recursive: true }, (_e, file) => {
    if (store.kind !== 'arquivos' || !file || file.endsWith('.tmp')) return;
    const t = selfWrites.get(file);
    if (t && Date.now() - t < 1500) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => broadcast({ type: 'externo' }), 250);
  });
} catch (e) { console.warn('Sem observação de pasta:', e.message); }

const arquivos = {
  kind: 'arquivos',
  async all() {
    const out = [];
    for (const f of await fsp.readdir(NOS)) {
      if (!f.endsWith('.json')) continue;
      try { out.push(JSON.parse(await fsp.readFile(path.join(NOS, f), 'utf8'))); }
      catch { /* arquivo no meio de uma sincronia; aparece no próximo evento */ }
    }
    return out;
  },
  async get(id) { try { return JSON.parse(await fsp.readFile(nodeFile(id), 'utf8')); } catch { return null; } },
  async exists(id) { return fs.existsSync(nodeFile(id)); },
  async put(node) { const f = nodeFile(node.id); markSelf(f); await writeAtomic(f, JSON.stringify(node, null, 2)); },
  async remove(ids) {
    const lixo = path.join(DADOS, 'lixeira', trashStamp());
    await fsp.mkdir(lixo, { recursive: true });
    for (const x of ids) {
      const f = nodeFile(x); markSelf(f);
      await move(f, path.join(lixo, x + '.json')).catch(() => {});
      const a = path.join(ANEXOS, x);
      if (fs.existsSync(a)) { markSelf(a); await move(a, path.join(lixo, 'anexos-' + x)).catch(() => {}); }
    }
  },
  async days() {
    const out = [];
    for (const f of await fsp.readdir(DIAS)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
      try { out.push(JSON.parse(await fsp.readFile(path.join(DIAS, f), 'utf8'))); } catch {}
    }
    return out;
  },
  async day(date) { try { return JSON.parse(await fsp.readFile(path.join(DIAS, date + '.json'), 'utf8')); } catch { return null; } },
  async putDay(date, day) {
    const f = path.join(DIAS, date + '.json'); markSelf(f);
    if (!day) await fsp.rm(f, { force: true }); else await writeAtomic(f, JSON.stringify(day, null, 2));
  },
  async saveFile(id, file, buf) {
    const dir = path.join(ANEXOS, id); await fsp.mkdir(dir, { recursive: true });
    const f = path.join(dir, file); markSelf(f); await fsp.writeFile(f, buf);
  },
  async trashFile(id, file) {
    const src = inside(path.join(ANEXOS, id), file);
    if (!src || !fs.existsSync(src)) return;
    const lixo = path.join(DADOS, 'lixeira', 'anexos'); await fsp.mkdir(lixo, { recursive: true });
    markSelf(src); await move(src, path.join(lixo, id + '-' + file)).catch(() => {});
  },
  async serveFile(res, id, file, download) {
    const f = inside(ANEXOS, id + '/' + file);
    return f ? serveFile(res, f, download) : send(res, 400, 'caminho');
  },
};

// ---------- armazenamento no Supabase ----------
const selfIds = new Map(); // bloco ou dia gravado por este computador -> instante (o tempo real devolve o eco)
const markId = id => selfIds.set(id, Date.now());
const rt = { state: 'offline', stop: null, keep: null };

function supaStore(sb) {
  const { db, storage } = sb;
  const row = n => ({ id: n.id, parent: n.parent || null, data: n, updated_at: new Date().toISOString() });
  const inList = ids => `id=in.(${ids.map(encodeURIComponent).join(',')})`;
  return {
    kind: 'supabase', sb,
    async all() { return (await db.select('nos', 'select=data')).map(r => r.data); },
    async get(id) { return (await db.select('nos', `select=data&id=eq.${encodeURIComponent(id)}`))[0]?.data || null; },
    async exists(id) { return (await db.select('nos', `select=id&id=eq.${encodeURIComponent(id)}`)).length > 0; },
    async put(node) { markId(node.id); await db.upsert('nos', [row(node)]); },
    async remove(ids) {
      // o bloco vai para a lixeira do banco e os anexos para a pasta lixeira/ do Storage: nada some de verdade
      const stamp = trashStamp();
      for (const { data: n } of await db.select('nos', `select=data&${inList(ids)}`)) {
        for (const f of n.files || []) await storage.move(anexoKey(n.id, f.file), `lixeira/${stamp}/${anexoKey(n.id, f.file)}`).catch(() => {});
        await db.insert('lixeira', [{ tipo: 'bloco', ref: n.id, data: n }]);
        markId(n.id);
      }
      await db.remove('nos', inList(ids));
    },
    async days() { return (await db.select('dias', 'select=data')).map(r => r.data); },
    async day(date) { return (await db.select('dias', `select=data&date=eq.${date}`))[0]?.data || null; },
    async putDay(date, day) {
      markId(date);
      if (!day) await db.remove('dias', `date=eq.${date}`);
      else await db.upsert('dias', [{ date, data: day, updated_at: new Date().toISOString() }]);
    },
    async saveFile(id, file, buf) { await storage.upload(anexoKey(id, file), buf, mimeOf(file)); },
    async trashFile(id, file) {
      const key = anexoKey(id, file);
      await storage.move(key, `lixeira/${trashStamp()}/${key}`).catch(() => {});
      await db.insert('lixeira', [{ tipo: 'anexo', ref: id, data: { file, key } }]);
    },
    async serveFile(res, id, file, download) {
      // na Vercel a resposta de uma função tem limite de tamanho: o navegador baixa direto do Storage
      if (NUVEM) { res.writeHead(302, { Location: await storage.signDownload(anexoKey(id, file), download), 'Cache-Control': 'private, max-age=300' }); return res.end(); }
      const r = await storage.download(anexoKey(id, file));
      if (!r.ok) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
      const headers = { 'Content-Type': mimeOf(file), 'Cache-Control': 'private, max-age=86400' };
      if (r.headers.get('content-length')) headers['Content-Length'] = r.headers.get('content-length');
      if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
      res.writeHead(200, headers);
      Readable.fromWeb(r.body).pipe(res);
    },
  };
}

let store = arquivos;
let rtTimer = null;
function useSupabase(conf) {
  const sb = supabase(conf);
  rt.stop?.(); clearInterval(rt.keep);
  store = supaStore(sb);
  clearTimeout(syncTimer);
  if (NUVEM) { rt.state = 'ok'; return; } // na Vercel as telas conferem as mudanças de tempos em tempos
  rt.stop = sb.realtime(({ id }) => {
    const t = selfIds.get(id);
    if (t && Date.now() - t < 4000) return;
    clearTimeout(rtTimer);
    rtTimer = setTimeout(() => broadcast({ type: 'externo' }), 250);
  }, state => { rt.state = state; broadcast({ type: 'sync', ...syncState() }); });
  // sinal de vida: projeto gratuito sem uso por uma semana é pausado
  rt.keep = setInterval(() => sb.db.select('nos', 'select=id&limit=1').catch(() => {}), 6 * 3600 * 1000);
}

// ---------- GitHub (modo arquivos) ----------
// Cada mudança nos dados vira um commit, enviado ao GitHub alguns segundos depois da última edição.
// A cada minuto o servidor também baixa o que chegou de lá (a outra pessoa editando).
const git = (...args) => new Promise((ok, fail) => execFile('git', args, { cwd: ROOT, timeout: 60000 }, (e, out, err) => e ? fail(Object.assign(e, { saida: String(err || out).trim() })) : ok(String(out).trim())));
const REL = path.relative(ROOT, DADOS);
const sync = { on: false, state: 'parado', at: 0, erro: '' };
let syncTimer = null, syncing = null, syncAgain = false;
const syncState = () => store.kind === 'supabase'
  ? { on: true, modo: 'supabase', state: rt.state === 'ok' ? 'ok' : rt.state === 'erro' ? 'erro' : 'offline', at: Date.now(), erro: rt.state === 'erro' ? 'o tempo real não conectou' : '' }
  : { ...sync, modo: 'github' };
async function gitReady() {
  // opcional: só liga com "github": true no config.json (ou BLATT_GITHUB=1), porque precisa de permissão de push.
  // Sem isso, quem clonou o repositório usa os dados em dados/ só no próprio computador.
  if (!(cfg.github === true || env.BLATT_GITHUB === '1')) return false;
  // só sincroniza se a pasta de dados estiver dentro do repositório e houver um remoto
  if (REL.startsWith('..') || path.isAbsolute(REL)) return false;
  try { await git('rev-parse', '--is-inside-work-tree'); return !!(await git('remote')); } catch { return false; }
}
function setSync(state, erro = '') {
  sync.state = state; sync.erro = erro; if (state === 'ok') sync.at = Date.now();
  broadcast({ type: 'sync', ...syncState() });
}
async function runSync(push) {
  if (!sync.on || store.kind !== 'arquivos') return;
  if (syncing) { syncAgain = syncAgain || push; return syncing; }
  syncing = (async () => {
    try {
      const before = await git('rev-parse', 'HEAD');
      if (push) {
        setSync('enviando');
        await git('add', '-A', '--', REL);
        try { await git('diff', '--cached', '--quiet', '--', REL); }
        catch { await git('commit', '-q', '-m', `Dados: atualização ${new Date().toLocaleString('pt-BR')}`, '--', REL); }
      }
      try { await git('pull', '-q', '--rebase', '--autostash'); }
      catch (e) { await git('rebase', '--abort').catch(() => {}); throw e; }
      if (push || (await git('rev-list', '--count', '@{u}..HEAD')) !== '0') await git('push', '-q');
      if ((await git('rev-parse', 'HEAD')) !== before) broadcast({ type: 'externo' });
      setSync('ok');
    } catch (e) {
      console.warn('GitHub:', e.saida || e.message);
      setSync('erro', e.saida || e.message);
    } finally {
      syncing = null;
      if (syncAgain) { const p = syncAgain; syncAgain = false; runSync(p); }
    }
  })();
  return syncing;
}
const scheduleSync = () => { if (!sync.on) return; clearTimeout(syncTimer); setSync('pendente'); syncTimer = setTimeout(() => runSync(true), 8000); };

// ---------- conectar o Supabase ----------
// Testa a conexão, cria o lugar dos arquivos, traz os dados que estão em dados/ (se o banco estiver vazio)
// e guarda a configuração neste computador (config.json não vai para o GitHub).
async function conectar(conf) {
  if (NUVEM) throw Object.assign(new Error('Na Vercel o banco é configurado pelas variáveis de ambiente SUPABASE_URL e SUPABASE_CHAVE do projeto.'), { campo: 'url' });
  const url = String(conf.url || '').trim().replace(/\/+$/, '');
  const chave = String(conf.chave || '').replace(/\s+/g, ''); // espaços e quebras de linha coladas sem querer
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw Object.assign(new Error('O endereço do projeto deve ser parecido com https://abcdefg.supabase.co'), { campo: 'url' });
  if (!chave) throw Object.assign(new Error('Cole a chave secreta do projeto'), { campo: 'chave' });
  if (chave.startsWith('sb_publishable_')) throw Object.assign(new Error('Essa é a chave publicável. Use a chave secreta (secret, começa com sb_secret_).'), { campo: 'chave' });
  const sb = supabase({ url, chave });
  let existentes;
  try { existentes = await sb.db.select('nos', 'select=id'); }
  catch (e) {
    // mostra só o começo da chave (o mesmo que o painel do Supabase mostra) para conferir se é a certa
    if (e.status === 401 || e.status === 403) {
      console.warn(`Supabase recusou a chave (${chave.slice(0, 14)}…, ${chave.length} caracteres): ${e.message}`);
      throw Object.assign(new Error(`O Supabase recusou a chave: "${e.message}". A chave recebida começa com ${chave.slice(0, 14)}… e tem ${chave.length} caracteres. Confira em API Keys se ela aparece na lista de secret keys com esse mesmo começo e copie pelo ícone de copiar, não selecionando o texto.`), { campo: 'chave' });
    }
    if (e.status === 404 || /schema cache|does not exist|PGRST205/i.test(e.message)) throw Object.assign(new Error('O banco ainda não tem a estrutura do sistema. Rode o SQL do passo 2 no SQL Editor e tente de novo.'), { campo: 'sql' });
    throw Object.assign(new Error('Não consegui falar com o Supabase: ' + e.message), { campo: 'url' });
  }
  await sb.storage.ensureBucket();
  const migrado = { nos: 0, dias: 0, anexos: 0, faltando: 0, jaTinha: existentes.length };
  if (!existentes.length) {
    const nos = await arquivos.all();
    for (let i = 0; i < nos.length; i += 50) await sb.db.upsert('nos', nos.slice(i, i + 50).map(n => ({ id: n.id, parent: n.parent || null, data: n, updated_at: new Date(n.updatedAt || Date.now()).toISOString() })));
    migrado.nos = nos.length;
    const dias = await arquivos.days();
    if (dias.length) await sb.db.upsert('dias', dias.map(d => ({ date: d.date, data: d, updated_at: new Date(d.updatedAt || Date.now()).toISOString() })));
    migrado.dias = dias.length;
    for (const n of nos) for (const f of n.files || []) {
      const src = inside(path.join(ANEXOS, n.id), f.file);
      if (!src || !fs.existsSync(src)) { migrado.faltando++; continue; }
      await sb.storage.upload(anexoKey(n.id, f.file), await fsp.readFile(src), mimeOf(f.file));
      migrado.anexos++;
    }
  }
  cfg = { ...cfg, supabase: { url, chave } };
  await writeAtomic(CONFIG, JSON.stringify(cfg, null, 2));
  useSupabase({ url, chave });
  broadcast({ type: 'externo' });
  return migrado;
}

// dados de um anexo novo, a partir de ?nome=&tipo=&etapa=&tamanho=
function newItem(url, size, ctype) {
  const nome = safeName(url.searchParams.get('nome'));
  const fid = crypto.randomBytes(6).toString('hex');
  const item = { id: fid, name: nome, file: fid + '-' + nome, size: size ?? (+url.searchParams.get('tamanho') || 0),
    type: MIME[path.extname(nome).toLowerCase()] || ctype || url.searchParams.get('mime') || 'application/octet-stream',
    kind: url.searchParams.get('tipo') === 'foto' ? 'foto' : 'arquivo', at: Date.now() };
  const etapa = url.searchParams.get('etapa'); if (etapa) item.task = String(etapa).replace(/[^a-z0-9]/gi, '').slice(0, 20); // anexo de uma tarefa do checklist
  return item;
}

// ---------- senha ----------
// Uma senha compartilhada pelos sócios. Quem entra recebe um cookie que vale 180 dias.
const PROTEGIDO = !!SENHA || NUVEM;
const TOKEN = SENHA ? crypto.createHmac('sha256', SENHA).update('blatt-sessao-v1').digest('hex') : '';
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]));
const autorizado = req => !PROTEGIDO || (!!TOKEN && cookies(req).blatt === TOKEN);
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
async function entrar(req, res) {
  if (!SENHA) return send(res, 503, { erro: 'A senha do sistema ainda não foi definida. Crie a variável BLATT_SENHA no projeto da Vercel e publique de novo.' });
  const { senha } = JSON.parse((await body(req)).toString() || '{}');
  if (!igual(senha || '', SENHA)) { await new Promise(r => setTimeout(r, 800)); return send(res, 401, { erro: 'Senha incorreta' }); }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `blatt=${TOKEN}; Path=/; Max-Age=${180 * 86400}; HttpOnly; SameSite=Lax${NUVEM ? '; Secure' : ''}` });
  res.end('{"ok":true}');
}

// ---------- rotas ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // sem "api"
  const [res0, id, sub, acao] = parts;

  if (res0 === 'eventos') {
    // na Vercel uma conexão aberta o dia todo custa caro: avisa o navegador para voltar em 20 s
    if (NUVEM) { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); return res.end('retry: 20000\n\n'); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (res0 === 'info' && req.method === 'GET') return send(res, 200, { dados: store.kind === 'supabase' ? store.sb.base : DADOS, sync: syncState() });
  // GET: estado da sincronização; POST: envia agora (botão Salvar)
  if (res0 === 'sync') {
    if (req.method === 'POST' && store.kind === 'arquivos') { clearTimeout(syncTimer); syncTimer = null; await runSync(true); }
    return send(res, 200, syncState());
  }

  if (res0 === 'supabase') {
    if (id === 'sql') return send(res, 200, SQL, 'text/plain; charset=utf-8');
    if (id === 'conectar' && req.method === 'POST') {
      try { return send(res, 200, { ok: true, migrado: await conectar(JSON.parse((await body(req)).toString() || '{}')) }); }
      catch (e) { return send(res, 400, { erro: e.message, campo: e.campo || '' }); }
    }
    return send(res, 200, { conectado: store.kind === 'supabase', projeto: store.kind === 'supabase' ? new URL(store.sb.base).hostname.split('.')[0] : '', tempoReal: rt.state });
  }

  // tarefas do dia
  if (res0 === 'dias') {
    if (!id && req.method === 'GET') {
      const out = (await store.days()).map(d => { const t = d.tasks || []; return { date: d.date, total: t.length, done: t.filter(x => x.done).length, tasks: t }; });
      return send(res, 200, out.sort((a, b) => a.date.localeCompare(b.date)));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id || '')) return send(res, 400, { erro: 'data' });
    if (req.method === 'GET') return send(res, 200, (await store.day(id)) || { date: id, tasks: [] });
    if (req.method === 'PUT') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      const tasks = Array.isArray(b.tasks) ? b.tasks.slice(0, 500).map(x => ({ id: String(x.id || crypto.randomBytes(4).toString('hex')).slice(0, 20), t: String(x.t || '').slice(0, 500), done: !!x.done, owner: ['s1', 's2', 'ambos'].includes(x.owner) ? x.owner : '', node: validId(x.node) ? x.node : '', at: +x.at || Date.now(), doneAt: x.done ? (+x.doneAt || Date.now()) : null })) : [];
      const day = { date: id, tasks, updatedAt: Date.now() };
      await store.putDay(id, tasks.length ? day : null);
      broadcast({ type: 'dia', date: id });
      return send(res, 200, day);
    }
    return send(res, 405, { erro: 'método' });
  }

  if (res0 !== 'nos') return send(res, 404, { erro: 'rota' });

  if (!id && req.method === 'GET') return send(res, 200, await store.all());

  if (!id && req.method === 'POST') {
    const patch = clean(JSON.parse((await body(req)).toString() || '{}'));
    if (patch.parent && !(await store.get(patch.parent))) return send(res, 400, { erro: 'pai inexistente' });
    let nid = slug(patch.title);
    while (await store.exists(nid)) nid = slug(patch.title).slice(0, 32) + '-' + crypto.randomBytes(2).toString('hex');
    const now = Date.now();
    const node = Object.assign({ id: nid, parent: null, title: 'Novo bloco', description: '', notes: '', owner: '', status: '',
      checklist: [], links: [], files: [], order: now, colorIndex: null, createdAt: now, updatedAt: now }, patch, { id: nid, createdAt: now, updatedAt: now });
    await store.put(node);
    broadcast({ type: 'no', id: nid });
    return send(res, 201, node);
  }

  if (!validId(id)) return send(res, 400, { erro: 'id' });
  const cur = await store.get(id);
  if (!cur) return send(res, 404, { erro: 'não existe' });

  if (!sub && req.method === 'GET') return send(res, 200, cur);

  if (!sub && req.method === 'PATCH') {
    const patch = clean(JSON.parse((await body(req)).toString() || '{}'));
    if ('parent' in patch) {
      if (!cur.parent) return send(res, 400, { erro: 'a raiz não muda de lugar' });
      if (!validId(patch.parent) || !(await store.get(patch.parent))) return send(res, 400, { erro: 'destino inexistente' });
      // impede ciclo: o novo pai não pode ser o próprio bloco nem um descendente dele
      const all = await store.all(); const byId = new Map(all.map(n => [n.id, n]));
      for (let p = patch.parent, i = 0; p && i < 60; p = byId.get(p)?.parent, i++) if (p === id) return send(res, 400, { erro: 'um bloco não pode ficar dentro dele mesmo' });
    }
    const node = Object.assign(cur, patch, { updatedAt: Date.now() });
    await store.put(node);
    broadcast({ type: 'no', id });
    return send(res, 200, node);
  }

  if (!sub && req.method === 'DELETE') {
    if (!cur.parent) return send(res, 400, { erro: 'a raiz não pode ser apagada' });
    // apaga o bloco e todos os descendentes; vão para a lixeira, não somem
    const all = await store.all();
    const ids = [id]; for (let i = 0; i < ids.length; i++) all.filter(n => n.parent === ids[i]).forEach(n => ids.push(n.id));
    await store.remove(ids);
    broadcast({ type: 'removido', ids });
    return send(res, 200, { removidos: ids });
  }

  // envio direto ao Storage: 1) assinar devolve um link temporário e o anexo; 2) o navegador envia; 3) confirmar grava no bloco
  if (sub === 'anexos' && acao === 'assinar' && req.method === 'POST') {
    if (store.kind !== 'supabase') return send(res, 409, { erro: 'sem-supabase' });
    const item = newItem(url);
    return send(res, 200, { url: await store.sb.storage.signUpload(anexoKey(id, item.file)), item });
  }
  if (sub === 'anexos' && acao === 'confirmar' && req.method === 'POST') {
    const { item } = JSON.parse((await body(req)).toString() || '{}');
    if (!item || !/^[0-9a-f]{12}$/.test(item.id) || !String(item.file).startsWith(item.id + '-')) return send(res, 400, { erro: 'anexo' });
    const clean = { id: item.id, name: String(item.name).slice(0, 150), file: String(item.file).slice(0, 170), size: +item.size || 0, type: String(item.type || 'application/octet-stream').slice(0, 120), kind: item.kind === 'foto' ? 'foto' : 'arquivo', at: Date.now() };
    if (item.task) clean.task = String(item.task).replace(/[^a-z0-9]/gi, '').slice(0, 20);
    const fresh = await store.get(id);
    if (!(fresh.files || []).some(f => f.id === clean.id)) fresh.files = [...(fresh.files || []), clean];
    fresh.updatedAt = Date.now();
    await store.put(fresh);
    broadcast({ type: 'no', id });
    return send(res, 201, { item: clean, node: fresh });
  }

  // upload pelo servidor (computador sem Supabase): PUT /api/nos/:id/anexos?nome=foto.jpg&tipo=foto
  if (sub === 'anexos' && req.method === 'PUT') {
    const buf = await body(req, MAX_UPLOAD);
    const item = newItem(url, buf.length, req.headers['content-type']);
    await store.saveFile(id, item.file, buf);
    const fresh = await store.get(id);
    fresh.files = [...(fresh.files || []), item]; fresh.updatedAt = Date.now();
    await store.put(fresh);
    broadcast({ type: 'no', id });
    return send(res, 201, { item, node: fresh });
  }

  if (sub === 'anexos' && req.method === 'DELETE') {
    const fid = url.searchParams.get('id');
    const item = (cur.files || []).find(x => x.id === fid);
    if (!item) return send(res, 404, { erro: 'anexo' });
    await store.trashFile(id, item.file);
    cur.files = cur.files.filter(x => x.id !== fid);
    if (cur.cover === fid) cur.cover = null;
    cur.updatedAt = Date.now();
    await store.put(cur);
    broadcast({ type: 'no', id });
    return send(res, 200, cur);
  }

  return send(res, 405, { erro: 'método' });
}

async function serveFile(res, file, download) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw 0;
    const headers = { 'Content-Type': mimeOf(file), 'Content-Length': st.size, 'Cache-Control': 'no-cache' };
    if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  } catch { send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/entrar' && req.method === 'POST') return await entrar(req, res);
    if (p === '/entrar') return serveFile(res, path.join(PUBLIC, 'entrar.html'));
    if (!autorizado(req) && (p.startsWith('/api/') || p.startsWith('/anexos/'))) return send(res, 401, { erro: 'Entre com a senha do sistema', entrar: true });
    if (!autorizado(req) && (p === '/' || p === '/conectar' || p.endsWith('.html'))) { res.writeHead(302, { Location: '/entrar' }); return res.end(); }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p.startsWith('/anexos/')) {
      const [id, ...rest] = p.slice('/anexos/'.length).split('/');
      if (!validId(id) || !rest.length || rest.some(s => !s || s === '..')) return send(res, 400, 'caminho');
      return await store.serveFile(res, id, rest.join('/'), url.searchParams.get('baixar'));
    }
    if (p.startsWith('/m/')) {
      const f = inside(MODULES, p.slice(3));
      return f ? serveFile(res, f) : send(res, 400, 'caminho');
    }
    const f = inside(PUBLIC, p === '/' ? 'index.html' : p === '/conectar' ? 'conectar.html' : p.slice(1));
    return f ? serveFile(res, f) : send(res, 400, 'caminho');
  } catch (e) {
    console.warn('Erro:', e.message);
    if (!res.headersSent) send(res, e.code === 413 ? 413 : 500, { erro: e.message });
    else res.destroy();
  }
});

if (SUPA.url && SUPA.chave) useSupabase(SUPA);
else if (!NUVEM) gitReady().then(ok => {
  sync.on = ok;
  if (!ok) return;
  runSync(true);
  setInterval(() => { if (sync.state !== 'pendente') runSync(false); }, 60000);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Sistema Blatt rodando em http://localhost:${PORT}`);
  console.log(store.kind === 'supabase'
    ? `  Dados no Supabase (${new URL(store.sb.base).hostname}), com backup diário no GitHub\n`
    : `  Dados em ${DADOS}, salvos neste computador\n  Para usar o Supabase, abra http://localhost:${PORT}/conectar\n`);
});
