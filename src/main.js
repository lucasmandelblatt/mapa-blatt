import * as THREE from 'three';
import ForceGraph3D from '3d-force-graph';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/* ---------- constantes ---------- */
// cores de sistema da Apple (modo escuro), na mesma ordem de matiz da paleta anterior
const AREA = ['#ffd60a', '#ff9f0a', '#ff6482', '#30d158', '#0a84ff', '#bf5af2', '#ac8e68', '#66d4cf'];
const INK = '#f5f5f7';
// trilha do quadro: do solto ao entregue, com uma parada para o OK do sócio
const STATUS = [
  ['ideia', 'Ideia', '#98989d', 'Solto, ainda sem compromisso'],
  ['afazer', 'A fazer', '#64d2ff', 'Decidido, com dono e prazo'],
  ['andamento', 'Em andamento', '#0a84ff', 'Alguém está tocando agora'],
  ['aprovacao', 'Em aprovação', '#ffd60a', 'Esperando o OK do outro sócio'],
  ['feito', 'Feito', '#30d158', 'Entregue'],
];
const STATUS_C = Object.fromEntries(STATUS.map(s => [s[0], s[2]]));
const HORIZON = [['lote', 'Curto prazo'], ['90d', '90 dias'], ['12m', '12 meses'], ['continuo', 'Contínuo']];
const PRIORITY = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];
// sócios: os nomes ficam no bloco raiz (campo socios) e se mudam no painel da empresa
const SOCIO_PADRAO = ['Sócio 1', 'Sócio 2'];
const socio = i => { const v = (root()?.socios || [])[i]; return (v && String(v).trim()) || SOCIO_PADRAO[i]; };
const nomeDe = k => k === 's1' ? socio(0) : k === 's2' ? socio(1) : '';
const inicial = k => { const i = k === 's1' ? 0 : 1; const n = nomeDe(k); return n === SOCIO_PADRAO[i] ? String(i + 1) : ([...n][0] || '?').toUpperCase(); };
const owners = () => [['s1', socio(0)], ['s2', socio(1)], ['ambos', 'Os dois'], ['', 'Ninguém']];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const DAY = 86400000;

// RO: cópia de visualização publicada como artefato; dados embutidos, sem edição
const RO = typeof __RO__ !== 'undefined' && __RO__;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- estado ---------- */
const S = {
  nodes: new Map(), open: null, tab: 'plano', view: 'mapa', hover: null,
  fOwner: '', fStatus: '', notesMode: 'ler', expanded: false,
  ctrlNode: '', ctrlQuery: '', ctrlFilter: 'todos', ctrlShow: 'afazer', ctrlOpen: '', ctrlSel: 0, newOwner: '', newFlag: '', newDue: '', ctrlMode: 'bloco', ctrlSort: 'manual', calMonth: '', calOnly: false, calDay: '', calRef: '', calKind: 'tarefa', calText: '', days: new Map(), ctrlLink: '', uploads: 0, taskOpen: new Set(), boardArea: '',
};

/* ---------- API ---------- */
// sem a senha (ou com ela expirada) o servidor responde 401: volta para a tela de entrada
const J = async r => { const b = await r.json().catch(() => ({})); if (r.status === 401 && b.entrar) { location.href = '/entrar'; throw new Error('entre com a senha'); } if (!r.ok) throw new Error(b.erro || r.statusText); return b; };
const enc = encodeURIComponent;
// anexo: com o banco conectado, o navegador envia direto ao Storage (sem limite de tamanho da Vercel); sem banco, pelo servidor
async function upload(id, file, tipo, etapa = '') {
  const nome = file.name || 'colado.png';
  const q = `nome=${enc(nome)}&tipo=${tipo}&tamanho=${file.size}&mime=${enc(file.type || '')}${etapa ? '&etapa=' + etapa : ''}`;
  const a = await fetch(`/api/nos/${id}/anexos/assinar?${q}`, { method: 'POST' });
  if (a.status === 409) return fetch(`/api/nos/${id}/anexos?${q}`, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then(J);
  const s = await J(a);
  const up = await fetch(s.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
  if (!up.ok) throw new Error(`o arquivo não subiu (${up.status})`);
  return fetch(`/api/nos/${id}/anexos/confirmar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: s.item }) }).then(J);
}
const roFail = () => Promise.reject(new Error('esta é uma cópia só para visualizar'));
const api = RO ? {
  all: async () => JSON.parse(JSON.stringify(window.__BLATT_DADOS__ || [])),
  patch: roFail, create: roFail, remove: roFail, upload: roFail, removeFile: roFail, saveDay: roFail,
  days: async () => Object.values(window.__BLATT_DIAS__ || {}).map(d => ({ date: d.date, total: d.tasks.length, done: d.tasks.filter(x => x.done).length, tasks: d.tasks })),
  day: async d => JSON.parse(JSON.stringify((window.__BLATT_DIAS__ || {})[d] || { date: d, tasks: [] })),
} : {
  all: () => fetch('/api/nos').then(J),
  patch: (id, data, keepalive = false) => fetch(`/api/nos/${id}`, { method: 'PATCH', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(J),
  create: data => fetch('/api/nos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(J),
  remove: id => fetch(`/api/nos/${id}`, { method: 'DELETE' }).then(J),
  upload,
  removeFile: (id, fid) => fetch(`/api/nos/${id}/anexos?id=${fid}`, { method: 'DELETE' }).then(J),
  days: () => fetch('/api/dias').then(J),
  day: d => fetch(`/api/dias/${d}`).then(J),
  saveDay: (d, tasks) => fetch(`/api/dias/${d}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks }) }).then(J),
  sync: () => fetch('/api/sync', { method: 'POST' }).then(J),
  info: () => fetch('/api/info').then(J),
};
const fileUrl = (id, f) => `${RO ? '' : '/'}anexos/${encodeURIComponent(id)}/${encodeURIComponent(f.file)}`;
// datas incompletas gravadas pelo campo antigo (ex.: ano "0002") viram "sem data", para não contarem como atraso
const cleanDate = v => okDate(v) ? v : '';
const norm = n => {
  if (n.status === 'aberto') n.status = 'aprovacao';
  if (n.plan) for (const k of ['inicio', 'fim']) if (n.plan[k] && !okDate(n.plan[k])) n.plan[k] = '';
  if (Array.isArray(n.checklist)) n.checklist.forEach(x => { if (x.due && !okDate(x.due)) x.due = ''; });
  return n;
};

/* ---------- GitHub ---------- */
// os dados ficam no repositório do GitHub: o servidor envia cada mudança e baixa as da outra pessoa
const hm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function showSync(s) {
  const el = $('#gh-sync'); if (!el || !s) return;
  el.hidden = false; el.dataset.state = s.state;
  el.querySelector('i').className = `ph-light ${s.modo === 'supabase' ? 'ph-database' : 'ph-github-logo'}`;
  if (s.modo === 'supabase') {
    el.title = s.state === 'ok' ? 'Dados no Supabase, com tempo real ligado. Backup diário no GitHub.'
      : s.state === 'erro' ? 'Dados no Supabase, mas o tempo real não conectou: as mudanças da outra pessoa aparecem ao recarregar.'
      : 'Reconectando ao Supabase';
    return;
  }
  if (!s.on) { el.title = 'Dados salvos neste computador, na pasta dados/. Clique para conectar um banco de dados.'; return; }
  el.title = s.state === 'ok' ? `Dados no GitHub. Último envio às ${hm(s.at)}. Clique para conectar o banco de dados.`
    : s.state === 'pendente' ? 'Mudanças esperando para ir ao GitHub'
    : s.state === 'enviando' ? 'Enviando ao GitHub'
    : s.state === 'erro' ? `Não enviou ao GitHub: ${s.erro || 'erro'}. Os dados estão salvos neste computador e vão na próxima tentativa.`
    : 'GitHub';
}

/* ---------- salvar ---------- */
const saveEl = $('#save');
let saveTimer;
// aviso ao lado do logo, visível em todas as abas: salvando, salvo ou erro (o erro fica até a próxima gravação dar certo)
function setSave(state, msg) {
  clearTimeout(saveTimer);
  saveEl.dataset.state = state;
  saveEl.title = state === 'err' ? (msg || 'Não salvou') + '. Confira se a janela do sistema (Terminal) continua aberta.' : '';
  saveEl.innerHTML = state === 'saving' ? '<i class="ph-light ph-circle-notch"></i>Salvando'
    : state === 'saved' ? '<i class="ph-light ph-check-circle"></i>Salvo'
    : state === 'err' ? '<i class="ph-light ph-warning"></i>Não salvou' : '';
  if (state === 'saved') saveTimer = setTimeout(() => { saveEl.dataset.state = 'idle'; saveEl.innerHTML = '<i class="ph-light ph-check"></i>'; saveEl.title = 'Tudo salvo'; }, 2600);
}
// Gravação: cada bloco tem uma fila própria e sempre envia o valor mais novo que está na tela.
// Assim uma gravação atrasada nunca chega por cima de uma mudança mais recente.
const pending = new Map();      // "id:campo" -> { t, id, field } (texto esperando a pessoa parar de digitar)
const dirty = new Map();        // id -> Set de campos com mudança ainda não confirmada pelo servidor
const chains = new Map();       // id -> última gravação em andamento daquele bloco
const recentSelf = new Map();
let saveFailed = false;
// troca o bloco pela versão do servidor sem perder o que ainda está sendo gravado
function adopt(id, fresh) { const cur = S.nodes.get(id); const d = dirty.get(id); if (cur && d) for (const f of d) fresh[f] = cur[f]; S.nodes.set(id, norm(fresh)); }
const markDirty = (id, fields) => { const s = dirty.get(id) || new Set(); fields.forEach(f => s.add(f)); dirty.set(id, s); updateSaveBtn(); };
function writeNode(id, fields, keepalive = false) {
  const prev = chains.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const n = S.nodes.get(id); if (!n) return true;
    const data = {}; for (const f of fields) data[f] = n[f] ?? null; // valor atual, não o de quando a edição começou
    recentSelf.set(id, Date.now());
    await api.patch(id, data, keepalive);
    const s = dirty.get(id); if (s) { fields.forEach(f => { if (!pending.has(id + ':' + f)) s.delete(f); }); if (!s.size) dirty.delete(id); }
    return true;
  });
  chains.set(id, run);
  run.then(() => { if (chains.get(id) === run) chains.delete(id); }, () => {});
  return run;
}
async function settle(p) {
  try { await p; saveFailed = false; if (!pending.size && !chains.size) setSave('saved'); updateSaveBtn(); return true; }
  catch (e) { saveFailed = true; setSave('err', 'Não salvou: ' + e.message); updateSaveBtn(); return false; }
}
function queue(id, field, value, delay = 450) {
  if (RO) return;
  const n = S.nodes.get(id); if (!n) return;
  n[field] = value; n.updatedAt = Date.now();
  markDirty(id, [field]);
  const key = id + ':' + field;
  if (pending.has(key)) clearTimeout(pending.get(key).t);
  setSave('saving');
  pending.set(key, { t: setTimeout(() => flush(key), delay), id, field });
}
function flush(key, keepalive = false) {
  const p = pending.get(key); if (!p) return Promise.resolve(true);
  clearTimeout(p.t); pending.delete(key);
  return settle(writeNode(p.id, [p.field], keepalive));
}
const flushAll = (keepalive = false) => Promise.all([...pending.keys()].map(k => flush(k, keepalive)));
async function saveNow(id, data) {
  if (RO) return false;
  const n = S.nodes.get(id); Object.assign(n, data, { updatedAt: Date.now() });
  const fields = Object.keys(data);
  // esta gravação já leva o valor mais novo desses campos: o que estava esperando para os mesmos campos sai da fila
  for (const f of fields) { const k = id + ':' + f; if (pending.has(k)) { clearTimeout(pending.get(k).t); pending.delete(k); } }
  markDirty(id, fields);
  setSave('saving');
  const ok = await settle(writeNode(id, fields));
  if (!ok) toast('Não salvou. Use o botão Salvar para tentar de novo.');
  return ok;
}
// botão Salvar: grava tudo o que está pendente no sistema inteiro, tenta de novo o que falhou e confere no arquivo
async function saveAll() {
  if (RO) return;
  const btn = $('#save-all'); btn.dataset.busy = '1';
  setSave('saving');
  await flushAll();
  for (const [id, fields] of [...dirty]) await settle(writeNode(id, [...fields]));
  await Promise.all([...chains.values()].map(p => p.catch(() => {})));
  let mismatch = 0;
  try {
    const server = new Map((await api.all()).map(n => [n.id, n]));
    for (const [id, fields] of [...dirty]) { const a = S.nodes.get(id), b = server.get(id); if (a && b && [...fields].some(f => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null))) mismatch++; }
  } catch { mismatch = -1; }
  delete btn.dataset.busy;
  if (mismatch === 0 && !dirty.size) {
    saveFailed = false; setSave('saved');
    // envia ao GitHub na hora, sem esperar a próxima rodada automática
    let s = null; try { s = await api.sync(); showSync(s); } catch {}
    toast(s?.modo === 'supabase' ? 'Tudo salvo no banco de dados, às ' + hm(Date.now())
      : !s || !s.on ? 'Tudo salvo e conferido no arquivo, às ' + hm(Date.now())
      : s.state === 'erro' ? 'Salvo neste computador, mas não enviou ao GitHub. Confira a internet e tente de novo.'
      : 'Tudo salvo e enviado ao GitHub, às ' + hm(s.at || Date.now()));
  }
  else { saveFailed = true; setSave('err', 'Não salvou'); toast('Não consegui salvar tudo. Confira se a janela do sistema (Terminal) está aberta e tente de novo.'); }
  updateSaveBtn();
}
function updateSaveBtn() {
  const b = $('#save-all'); if (!b) return;
  const n = dirty.size;
  b.dataset.state = saveFailed ? 'err' : n ? 'dirty' : 'clean';
  b.querySelector('span').textContent = saveFailed ? 'Tentar de novo' : 'Salvar';
  b.title = saveFailed ? 'Algumas mudanças não foram salvas. Clique para tentar de novo (⌘S).' : n ? `Gravando ${n} bloco${n > 1 ? 's' : ''}. Clique para salvar agora (⌘S).` : 'Tudo salvo. Clique para conferir (⌘S).';
}
addEventListener('beforeunload', e => {
  if (pending.size) flushAll(true);
  if (dirty.size || pending.size || chains.size) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- árvore ---------- */
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(String(b.title), 'pt');
const kids = id => [...S.nodes.values()].filter(n => n.parent === id).sort(byOrder);
const root = () => [...S.nodes.values()].find(n => !n.parent);
const planets = () => kids(root().id);
function depth(id) { let d = 0, n = S.nodes.get(id); while (n && n.parent && d < 50) { n = S.nodes.get(n.parent); d++; } return d; }
function areaOf(id) { let n = S.nodes.get(id); if (!n || !n.parent) return null; while (n && S.nodes.get(n.parent)?.parent) n = S.nodes.get(n.parent); return n; }
function colorOf(id) {
  const a = areaOf(id); if (!a) return INK;
  const i = a.colorIndex ?? planets().findIndex(k => k.id === a.id);
  return AREA[((i % 8) + 8) % 8];
}
function path(id) { const p = []; let n = S.nodes.get(id); while (n) { p.unshift(n); n = n.parent ? S.nodes.get(n.parent) : null; } return p; }
function descendants(id) { const out = []; const walk = i => kids(i).forEach(k => { out.push(k); walk(k.id); }); walk(id); return out; }
const effOwner = id => { for (const n of path(id).reverse()) if (n.owner) return n.owner; return ''; };
const ownersOf = o => o === 'ambos' ? ['s1', 's2'] : o ? [o] : [];
const whoHTML = o => { const l = ownersOf(o); return l.length ? `<span class="whos">${l.map(w => `<b class="who ${w === 's1' ? 'l' : 'e'}" title="${esc(nomeDe(w))}">${esc(inicial(w))}</b>`).join('')}</span>` : ''; };
const statusOf = n => n.status || 'ideia';
const statusLabel = v => (STATUS.find(s => s[0] === v) || STATUS[0])[1];
const photos = n => (n.files || []).filter(f => f.kind === 'foto');
const docs = n => (n.files || []).filter(f => f.kind !== 'foto');
const coverOf = n => photos(n).find(f => f.id === n.cover) || null;
const plan = n => n.plan || {};
const kindOf = id => { const d = depth(id); return d === 0 ? 'Sol' : d === 1 ? 'Planeta' : d === 2 ? 'Estrela' : 'Satélite'; };

/* ---------- datas e dinheiro ---------- */
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
// datas com ano de 4 dígitos entre 1900 e 2200; o que vier fora disso (ex.: "0002-11-18" de um ano digitado pela metade) conta como sem data
const okDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return false; const [y, mo, d] = [+m[1], +m[2], +m[3]]; const t = new Date(y, mo - 1, d); return y >= 1900 && y <= 2200 && t.getMonth() === mo - 1 && t.getDate() === d; };
const parseDate = s => { if (!okDate(s)) return null; const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const fmtDate = s => { const t = parseDate(s); if (!t) return ''; const d = new Date(t); const b = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', ''); return d.getFullYear() === new Date().getFullYear() ? b : `${b} ${d.getFullYear()}`; };
const fmtLong = s => { const t = parseDate(s); return t ? new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ') : ''; };
const money = v => (v === '' || v == null || isNaN(+v)) ? '' : BRL.format(+v);
function deadline(fim, done) {
  const t = parseDate(fim); if (!t) return null;
  const diff = Math.round((t - today()) / DAY);
  // "Entregue" só a partir do dia da entrega; antes disso, mesmo marcado como Feito, mostra quanto falta
  if (done && diff <= 0) return { cls: 'ok', txt: 'Entregue' };
  if (done) return { cls: '', txt: `Faltam ${diff} dia${diff === 1 ? '' : 's'}` };
  if (diff < 0) return { cls: 'late', txt: `Atrasado ${-diff} dia${diff === -1 ? '' : 's'}` };
  if (diff === 0) return { cls: 'soon', txt: 'Vence hoje' };
  if (diff <= 5) return { cls: 'soon', txt: `Faltam ${diff} dia${diff === 1 ? '' : 's'}` };
  return { cls: '', txt: `Faltam ${diff} dias` };
}
// soma do que está abaixo de um planeta (ou do sol)
function rollup(id) {
  const items = descendants(id);
  const prev = items.reduce((s, n) => s + (+plan(n).custoPrev || 0), 0);
  const real = items.reduce((s, n) => s + (+plan(n).custoReal || 0), 0);
  const fims = items.map(n => plan(n).fim).filter(okDate).sort();
  const done = items.filter(n => n.status === 'feito').length;
  const late = items.filter(n => n.status !== 'feito' && parseDate(plan(n).fim) && parseDate(plan(n).fim) < today()).length;
  return { count: items.length, prev, real, last: fims[fims.length - 1] || '', done, late };
}

function selfMatch(id) {
  const n = S.nodes.get(id);
  if (S.fOwner) { const o = effOwner(id); if (S.fOwner === 'none' ? o !== '' : !ownersOf(o).includes(S.fOwner)) return false; }
  if (S.fStatus && statusOf(n) !== S.fStatus) return false;
  return true;
}
const filterOn = () => !!(S.fOwner || S.fStatus);
function matches(id) {
  if (!filterOn()) return true;
  if (!S.nodes.get(id).parent) return true;
  return selfMatch(id) || descendants(id).some(d => selfMatch(d.id));
}
function neighborhood(id) {
  if (!id || !S.nodes.get(id)) return null;
  const set = new Set(path(id).map(n => n.id));
  kids(id).forEach(k => set.add(k.id));
  return set;
}
function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.round(s / 86400)} dia${s < 86400 * 1.5 ? '' : 's'}`;
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
const size = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';

/* ---------- markdown leve ---------- */
function safeUrl(u) { return /^(https?:\/\/|\/anexos\/|mailto:)/i.test(u) ? u : null; }
function inline(s) {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => { const x = safeUrl(u.replace(/&amp;/g, '&')); return x ? `<img src="${esc(x)}" alt="${a}">` : m; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => { const x = safeUrl(u.replace(/&amp;/g, '&')); return x ? `<a href="${esc(x)}" target="_blank" rel="noopener">${t}</a>` : m; });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}
function md(src) {
  const lines = String(src || '').split('\n'); let out = '', list = false, para = [];
  const endPara = () => { if (para.length) { out += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const endList = () => { if (list) { out += '</ul>'; list = false; } };
  for (const raw of lines) {
    const l = raw.trimEnd(); let m;
    if (!l.trim()) { endPara(); endList(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { endPara(); endList(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if ((m = l.match(/^\s*[-*]\s+(.*)/))) { endPara(); if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^>\s?(.*)/))) { endPara(); endList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    endList(); para.push(l);
  }
  endPara(); endList();
  return out;
}

/* ---------- texturas ---------- */
function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.18, 'rgba(255,255,255,.35)'); g.addColorStop(.5, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.stroke();
  return new THREE.CanvasTexture(c);
}
const HALO = haloTexture(), RING = ringTexture();
const SPHERE = new Map();
const sphereGeo = r => { if (!SPHERE.has(r)) SPHERE.set(r, new THREE.SphereGeometry(r, 48, 32)); return SPHERE.get(r); };

let LOGO_TEX = null, LOGO_SVG = '';
// o sol mostra o nome da empresa (título do bloco raiz), escrito em vetor para ficar nítido
const sunSVG = t => { t = String(t || 'Sua empresa').trim() || 'Sua empresa'; const fs = Math.round(Math.min(230, 1700 / Math.max(3, [...t].length))); return `<svg viewBox="0 0 1032 358" xmlns="http://www.w3.org/2000/svg" role="img"><text x="516" y="179" dominant-baseline="central" text-anchor="middle" font-family="'Bricolage Grotesque Variable', system-ui, sans-serif" font-weight="700" font-size="${fs}" fill="currentColor">${esc(t)}</text></svg>`; };
async function loadLogo() {
  const svg = RO ? window.__BLATT_LOGO__ : await (await fetch('/marca/blatt-logo.svg')).text();
  $('#logo').innerHTML = svg; LOGO_SVG = svg;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg.replace(/currentColor/g, INK)], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas'); c.width = 1032; c.height = 358;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  LOGO_TEX = new THREE.CanvasTexture(c); LOGO_TEX.colorSpace = THREE.SRGBColorSpace; LOGO_TEX.anisotropy = 8;
}
const coverCache = new Map();
function coverTexture(url, color) {
  const key = url + color;
  if (coverCache.has(key)) return coverCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.crossOrigin = 'anonymous'; // na Vercel a imagem vem do Storage, outro endereço: sem isso a textura 3D fica bloqueada
  img.onload = () => {
    const x = c.getContext('2d'); const s = Math.min(img.width, img.height);
    x.save(); x.beginPath(); x.arc(128, 128, 118, 0, Math.PI * 2); x.clip();
    x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 10, 10, 236, 236); x.restore();
    x.strokeStyle = color; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 120, 0, Math.PI * 2); x.stroke();
    tex.needsUpdate = true;
  };
  img.src = url;
  coverCache.set(key, tex);
  return tex;
}

/* ---------- cena 3D ---------- */
const sceneEl = $('#scene');
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.pointerEvents = 'none';
let G;
const objs = new Map();
const gnodes = new Map();
let structureSig = '';
let dragging = null;
let sunLabel = null;

function fillNode(g, id) {
  const n = S.nodes.get(id); const d = depth(id); const col = colorOf(id); const color = new THREE.Color(col);
  const mats = [];
  const noHit = o => { o.raycast = () => {}; return o; };
  const add = (obj, base) => { g.add(obj); if (obj.material) { obj.material.transparent = true; mats.push({ m: obj.material, base }); } };
  const r = d === 0 ? 15 : d === 1 ? 8 : d === 2 ? 4 : 3;

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(d === 0 ? 120 : r * (d === 1 ? 6 : 4.2));
  add(noHit(halo), d === 0 ? .14 : d === 1 ? .5 : .3);

  if (d === 0 && LOGO_TEX) {
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color: new THREE.Color('#f3e6c8'), depthWrite: false, blending: THREE.AdditiveBlending }));
    corona.scale.setScalar(240); add(noHit(corona), .035);
    // o logo em si é vetor (rótulo HTML abaixo), para ficar nítido como no canto da tela
    const hit = new THREE.Mesh(sphereGeo(15), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); g.add(hit);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(48, .22, 8, 160), new THREE.MeshBasicMaterial({ color: INK }));
    ring.rotation.x = Math.PI / 2.3; ring.userData.spin = .0025; add(noHit(ring), .45);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(60, .14, 8, 160), new THREE.MeshBasicMaterial({ color: INK }));
    ring2.rotation.x = Math.PI / 1.8; ring2.rotation.y = .4; ring2.userData.spin = -.0016; add(noHit(ring2), .22);
  } else if (coverOf(n)) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: coverTexture(fileUrl(id, coverOf(n)), col), depthWrite: false }));
    sp.scale.setScalar(r * 3.4); add(sp, 1);
  } else {
    add(new THREE.Mesh(sphereGeo(r), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: d === 1 ? .38 : .3, roughness: .35, metalness: .08 })), 1);
  }
  if (d === 1) {
    // anel fino em volta do planeta
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(r * 2.4, .08, 6, 96), new THREE.MeshBasicMaterial({ color }));
    orbit.rotation.x = Math.PI / 2.1; add(noHit(orbit), .35);
  }
  if (d >= 2 && n.status) {
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING, color: new THREE.Color(STATUS_C[statusOf(n)]), depthWrite: false }));
    ring.scale.setScalar(r * 3.3); add(noHit(ring), .9);
  }

  const el = document.createElement('div');
  if (d === 0) { el.className = 'lbl lbl-root'; el.innerHTML = sunSVG(n.title); el.setAttribute('aria-label', n.title || 'Sua empresa'); sunLabel = el; }
  else if (d === 1) { el.className = 'lbl lbl-area'; el.style.setProperty('--c', col); el.innerHTML = `${esc(n.title)}<span class="n">${descendants(id).length}</span>`; }
  else { el.className = 'lbl lbl-leaf'; el.style.setProperty('--c', col); el.innerHTML = `${whoHTML(n.owner)}${esc(n.title)}`; }
  el.addEventListener('click', e => { e.stopPropagation(); openNode(id, true); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); nodeMenu(id, e.clientX, e.clientY); });
  el.addEventListener('pointerenter', () => setHover(id));
  el.addEventListener('pointerleave', () => setHover(null));
  g.add(new CSS2DObject(el));
  g.userData = { mats, label: el, depth: d };
}
function makeNodeObject(gn) {
  const g = new THREE.Group();
  objs.set(gn.id, g);
  if (S.nodes.has(gn.id)) fillNode(g, gn.id);
  return g;
}
function refreshNodeObject(id) {
  const g = objs.get(id); if (!g) return;
  [...g.children].forEach(c => { g.remove(c); c.material?.dispose?.(); });
  fillNode(g, id);
}
const refreshBranch = id => { refreshNodeObject(id); descendants(id).forEach(x => refreshNodeObject(x.id)); };

// planetas: posição salva ou órbita padrão; estrelas com posição salva seguem o pai
function placeBodies() {
  const r = root(); if (!r) return;
  const gr = gnodes.get(r.id); if (gr) { gr.fx = 0; gr.fy = 0; gr.fz = 0; }
  const ps = planets(); const R = 215;
  ps.forEach((a, i) => {
    const gn = gnodes.get(a.id); if (!gn || dragging === a.id) return;
    if (a.pos) { gn.fx = a.pos.x; gn.fy = a.pos.y; gn.fz = a.pos.z; return; }
    const t = ((i + .5) / ps.length) * Math.PI * 2 - Math.PI / 2;
    gn.fx = Math.cos(t) * R; gn.fz = Math.sin(t) * R; gn.fy = Math.sin(i * 2.1) * 42;
  });
  pinFollowers();
}
function pinFollowers() {
  for (const n of S.nodes.values()) {
    if (!n.parent || dragging === n.id) continue;
    if (!S.nodes.get(n.parent)?.parent) continue; // planetas são tratados em placeBodies
    const gn = gnodes.get(n.id), p = gnodes.get(n.parent); if (!gn || !p) continue;
    if (n.pos) {
      gn.fx = (p.fx ?? p.x) + n.pos.x; gn.fy = (p.fy ?? p.y) + n.pos.y; gn.fz = (p.fz ?? p.z) + n.pos.z;
    } else if (gn.fx !== undefined) { delete gn.fx; delete gn.fy; delete gn.fz; }
  }
}

function syncGraph(force = false) {
  const list = [...S.nodes.values()];
  const sig = list.map(n => n.id + '>' + (n.parent || '')).sort().join('|');
  if (force || sig !== structureSig) {
    structureSig = sig;
    for (const id of [...gnodes.keys()]) if (!S.nodes.has(id)) { objs.get(id)?.userData.label?.remove(); gnodes.delete(id); objs.delete(id); }
    for (const n of list) if (!gnodes.has(n.id)) {
      const p = n.parent && gnodes.get(n.parent);
      gnodes.set(n.id, { id: n.id, x: (p?.x ?? 0) + (Math.random() - .5) * 30, y: (p?.y ?? 0) + (Math.random() - .5) * 30, z: (p?.z ?? 0) + (Math.random() - .5) * 30 });
    }
    placeBodies();
    const links = list.filter(n => n.parent && gnodes.has(n.parent)).map(n => ({ source: n.parent, target: n.id }));
    G.graphData({ nodes: [...gnodes.values()], links });
  } else { placeBodies(); G.d3ReheatSimulation(); }
  applyVisuals();
}

function setHover(id) {
  if (S.hover === id) return;
  S.hover = id;
  sceneEl.style.cursor = id ? 'pointer' : '';
  applyVisuals();
}
const linkEnds = l => [typeof l.source === 'object' ? l.source.id : l.source, typeof l.target === 'object' ? l.target.id : l.target];
function applyVisuals() {
  if (!G) return;
  const hot = neighborhood(S.hover);
  const openSet = neighborhood(S.open);
  if (openSet) { const on = S.nodes.get(S.open); if (on.parent && on.parent !== root().id) kids(on.parent).forEach(k => openSet.add(k.id)); }
  for (const [id, g] of objs) {
    if (!S.nodes.has(id)) continue;
    const dim = !matches(id) || (hot && !hot.has(id));
    for (const { m, base } of g.userData.mats || []) m.opacity = dim ? base * .12 : base;
    const el = g.userData.label; if (!el) continue;
    el.classList.toggle('dim', dim);
    el.classList.toggle('hot', !dim && !!((hot && hot.has(id)) || (openSet && openSet.has(id)) || (filterOn() && g.userData.depth >= 2 && selfMatch(id))));
  }
  G.linkDirectionalParticles(l => { const [s, t] = linkEnds(l); return hot && hot.has(s) && hot.has(t) ? 3 : 0; });
  G.linkColor(l => colorOf(linkEnds(l)[1]));
  G.linkOpacity(hot ? .5 : .32);
}

// espaço: órbitas como linhas de instrumento, estrelas em camadas e um cinturão distante
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.85)'); g.addColorStop(.6, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function buildSpace(scene) {
  const ink = new THREE.Color(INK);
  const orbits = new THREE.Group();
  const ring = (r, opacity, dashed) => {
    const pts = []; for (let a = 0; a <= 256; a++) { const t = a / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed ? new THREE.LineDashedMaterial({ color: ink, transparent: true, opacity, dashSize: 2.2, gapSize: 5.5, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity, depthWrite: false });
    const line = new THREE.Line(geo, mat); if (dashed) line.computeLineDistances();
    orbits.add(line);
  };
  ring(105, .05, false);
  ring(215, .17, true);   // órbita dos planetas
  ring(335, .06, false);
  ring(470, .045, true);
  // marcações na órbita principal, como num instrumento
  const tick = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 96 * Math.PI * 2, long = i % 8 === 0, r0 = 215 + 3, r1 = 215 + (long ? 12 : 6);
    tick.push(Math.cos(t) * r0, 0, Math.sin(t) * r0, Math.cos(t) * r1, 0, Math.sin(t) * r1);
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tick, 3));
  orbits.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: .13, depthWrite: false })));
  scene.add(orbits);

  const DOT = dotTexture();
  const tints = [new THREE.Color(INK), new THREE.Color('#d7dde6'), new THREE.Color('#f1dcc0')];
  const layer = (n, rMin, rMax, px, opacity, flat = .75) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rad = rMin + Math.random() * (rMax - rMin), s = Math.sqrt(1 - u * u);
      pos[i * 3] = rad * s * Math.cos(th); pos[i * 3 + 1] = rad * u * flat; pos[i * 3 + 2] = rad * s * Math.sin(th);
      const c = tints[Math.random() < .78 ? 0 : Math.random() < .5 ? 1 : 2]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: px * Math.min(devicePixelRatio, 2), sizeAttenuation: false, map: DOT, vertexColors: true, transparent: true, opacity, depthWrite: false, fog: false });
    const p = new THREE.Points(g, mat); p.userData.base = opacity; scene.add(p); return p;
  };
  const far = layer(1600, 1300, 2600, 1.5, .5);
  const mid = layer(300, 900, 1800, 2.3, .7);
  const near = layer(40, 800, 1500, 3.4, .9);

  // cinturão distante: uma faixa fina de poeira no plano das órbitas
  const N = 1600, bp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = Math.random() * Math.PI * 2, r = 560 + (Math.random() + Math.random() - 1) * 34;
    bp[i * 3] = Math.cos(t) * r; bp[i * 3 + 1] = (Math.random() - .5) * 10; bp[i * 3 + 2] = Math.sin(t) * r;
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  const belt = new THREE.Points(bg, new THREE.PointsMaterial({ color: ink, size: 1.1 * Math.min(devicePixelRatio, 2), sizeAttenuation: false, map: DOT, transparent: true, opacity: .26, depthWrite: false }));
  scene.add(belt);

  return {
    tick(time) {
      if (REDUCED) return;
      belt.rotation.y -= .00025;
      far.rotation.y += .00004; mid.rotation.y += .00006; near.rotation.y += .00008;
      mid.material.opacity = mid.userData.base * (.82 + .18 * Math.sin(time * .0011));
      near.material.opacity = near.userData.base * (.7 + .3 * Math.sin(time * .0017 + 1.3));
    },
  };
}

// com a janela escondida (tamanho zero) a proporção vira NaN e a câmera se perde; nesse caso usa 1
const fit = () => { const a = innerWidth / innerHeight; return Number.isFinite(a) && a > 0 ? Math.max(1, Math.sqrt(1.15 / a)) : 1; };
const HOME = { get x() { return 0; }, get y() { return 150 * fit(); }, get z() { return 500 * fit(); } };
function flyTo(id) {
  const gn = gnodes.get(id); if (!gn || !G) return;
  const d = depth(id);
  if (d === 0) { G.cameraPosition(HOME, { x: 0, y: 0, z: 0 }, REDUCED ? 0 : 1600); return; }
  const dist = d === 1 ? 200 : 135;
  const len = Math.hypot(gn.x, gn.z) || 1;
  G.cameraPosition({ x: gn.x + gn.x / len * dist, y: gn.y + dist * .45, z: gn.z + gn.z / len * dist }, { x: gn.x, y: gn.y, z: gn.z }, REDUCED ? 0 : 1500);
}

let spinning = !REDUCED, idleTimer;
function setSpin(on) {
  spinning = on;
  if (G) G.controls().autoRotate = on && !dragging;
  const b = $('#cam-spin'); b.setAttribute('aria-pressed', on); b.innerHTML = `<i class="ph-light ${on ? 'ph-pause' : 'ph-play'}"></i>`;
  b.title = on ? 'Parar rotação' : 'Girar sozinho';
}

// estrela solta perto de outro planeta passa a orbitar ele
// medido na tela, em pixels: é o que o olho vê enquanto arrasta
function toScreen(o) {
  const v = new THREE.Vector3(o.x, o.y, o.z).project(G.camera());
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}
function nearestPlanet(gn) {
  const s = toScreen(gn);
  let best = null, bd = Infinity;
  for (const p of planets()) {
    const pg = gnodes.get(p.id); if (!pg) continue;
    const q = toScreen(pg); const d = Math.hypot(s.x - q.x, s.y - q.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { planet: best, dist: bd } : null;
}
const CAPTURE = 70;

function initGraph() {
  G = ForceGraph3D({ extraRenderers: [labelRenderer], controlType: 'orbit' })(sceneEl)
    .backgroundColor('rgba(0,0,0,0)')
    .showNavInfo(false)
    .nodeId('id')
    .nodeLabel(() => '')
    .nodeThreeObject(makeNodeObject)
    .nodeThreeObjectExtend(false)
    .linkWidth(l => depth(linkEnds(l)[1]) === 1 ? .7 : 0)
    .linkOpacity(.32)
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(.006)
    .linkDirectionalParticleColor(() => INK)
    .enableNodeDrag(!RO)
    .warmupTicks(80)
    .cooldownTime(6000)
    .onEngineTick(pinFollowers)
    .onNodeClick(n => openNode(n.id, true))
    .onNodeRightClick((n, e) => nodeMenu(n.id, e.clientX, e.clientY))
    .onBackgroundRightClick(e => { if (e?.target?.closest?.('.lbl') || Date.now() - lastNodeMenu < 300) return; bgMenu(e.clientX, e.clientY); })
    .onNodeHover(n => { if (!dragging) setHover(n ? n.id : null); })
    .onNodeDrag(gn => {
      if (!dragging) { dragging = gn.id; G.controls().autoRotate = false; closeMenu(); }
      if (depth(gn.id) === 2) { const np = nearestPlanet(gn); setHover(np && np.dist < CAPTURE ? np.planet.id : S.nodes.get(gn.id).parent); }
      pinFollowers();
    })
    .onNodeDragEnd(gn => dropBody(gn))
    .onBackgroundClick(() => { closeMenu(); if (S.open) closeDrawer(); });
  G.d3Force('charge').strength(n => depth(n.id) === 0 ? -400 : -55);
  G.d3Force('link').distance(l => depth(linkEnds(l)[1]) === 1 ? 215 : 46).strength(l => depth(linkEnds(l)[1]) === 1 ? .05 : .9);
  sceneEl.addEventListener('pointerleave', () => { if (!dragging) { G.enablePointerInteraction(false); setHover(null); } });
  sceneEl.addEventListener('pointerenter', () => G.enablePointerInteraction(true));
  sceneEl.addEventListener('contextmenu', e => e.preventDefault());
  // a biblioteca dispara um pointerup de toque falso ao soltar um corpo; o controle da câmera quebra com ele
  document.addEventListener('pointerup', e => { if (!e.isTrusted && e.pointerType === 'touch') e.stopImmediatePropagation(); }, true);
  const r = G.renderer(); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  const scene = G.scene();
  scene.fog = new THREE.Fog(0x05070b, 800, 2400);
  const env = buildSpace(scene);
  const ctr = G.controls();
  ctr.mouseButtons.RIGHT = -1; // botão direito é do menu, não da câmera
  ctr.autoRotate = spinning; ctr.autoRotateSpeed = .35; ctr.enableDamping = true; ctr.dampingFactor = .08; ctr.minDistance = 40; ctr.maxDistance = 1500;
  ctr.addEventListener('start', () => { closeMenu(); if (spinning) { ctr.autoRotate = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (spinning && !dragging) ctr.autoRotate = true; }, 14000); } });
  G.cameraPosition({ x: 0, y: 420, z: 1300 });
  setTimeout(() => G.cameraPosition(HOME, { x: 0, y: 0, z: 0 }, REDUCED ? 0 : 2600), 120);

  let off = 0;
  const cam = G.camera();
  (function loop(time = 0) {
    requestAnimationFrame(loop);
    const drawerW = S.open && innerWidth > 900 ? Math.min(516, innerWidth * .42) : 0;
    off += (drawerW / 2 - off) * (REDUCED ? 1 : .07);
    if (!innerWidth || !innerHeight) return;
    if (Math.abs(off) > .4) cam.setViewOffset(innerWidth, innerHeight, off, 0, innerWidth, innerHeight); else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    env.tick(time);
    const rg = root() && objs.get(root().id);
    if (rg && !REDUCED) rg.children.forEach(c => { if (c.userData.spin) c.rotation.z += c.userData.spin; });
    if (![cam.position.x, cam.position.y, cam.position.z, ctr.target.x].every(Number.isFinite)) { cam.position.set(HOME.x, HOME.y, HOME.z); ctr.target.set(0, 0, 0); ctr.update(); }
    const camDist = cam.position.distanceTo(ctr.target);
    sceneEl.classList.toggle('show-leaves', camDist < 300 && !S.open);
    // o logo do sol cresce e diminui com o zoom, como se fosse parte da cena
    if (sunLabel && root()) { const sd = cam.position.distanceTo(new THREE.Vector3(0, 0, 0)); sunLabel.style.width = Math.max(70, Math.min(320, 80000 / sd)).toFixed(1) + 'px'; }
  })();
  addEventListener('resize', () => G.width(innerWidth).height(innerHeight));
}

async function dropBody(gn) {
  const id = gn.id; const d = depth(id); const n = S.nodes.get(id);
  dragging = null; setHover(null);
  if (spinning) setTimeout(() => { if (spinning && !dragging) G.controls().autoRotate = true; }, 6000);
  const round = v => Math.round(v * 10) / 10;
  if (d === 0) { gn.fx = 0; gn.fy = 0; gn.fz = 0; G.d3ReheatSimulation(); return; }
  if (d === 1) {
    gn.fx = gn.x; gn.fy = gn.y; gn.fz = gn.z;
    await saveNow(id, { pos: { x: round(gn.x), y: round(gn.y), z: round(gn.z) } });
    pinFollowers(); G.d3ReheatSimulation();
    return;
  }
  let target = n.parent;
  if (d === 2) { const np = nearestPlanet(gn); if (np && np.dist < CAPTURE && np.planet.id !== n.parent) target = np.planet.id; }
  const p = gnodes.get(target);
  const pos = { x: round(gn.x - p.x), y: round(gn.y - p.y), z: round(gn.z - p.z) };
  gn.fx = gn.x; gn.fy = gn.y; gn.fz = gn.z;
  if (target !== n.parent) {
    const fromId = n.parent; const from = S.nodes.get(fromId).title;
    // ao trocar de planeta, a estrela entra na órbita natural do novo planeta
    delete gn.fx; delete gn.fy; delete gn.fz;
    if (await saveNow(id, { parent: target, pos: null })) {
      syncGraph(); refreshBranch(id); refreshNodeObject(fromId); refreshNodeObject(target); renderLegend(); renderOtherViews(); applyVisuals();
      if (S.open === id) renderDrawer();
      toast(`"${n.title}" saiu de ${from} e agora orbita ${S.nodes.get(target).title}`);
    }
  } else {
    await saveNow(id, { pos });
  }
  G.d3ReheatSimulation();
}

/* ---------- menu de contexto ---------- */
const menu = $('#menu');
function closeMenu() { menu.hidden = true; }
function showMenu(x, y, html, handlers) {
  menu.innerHTML = html; menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 12)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - h - 12)) + 'px';
  menu.onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    closeMenu(); handlers[b.dataset.m]?.(b.dataset);
  };
}
const mItem = (k, icon, label, extra = '') => `<button data-m="${k}" ${extra}><i class="ph-light ${icon}"></i>${label}</button>`;
function bgMenu(x, y) {
  if (RO) return showMenu(x, y, `<div class="m-head">Sistema</div>${mItem('home', 'ph-crosshair', 'Voltar ao centro')}`, { home: () => $('#cam-home').click() });
  showMenu(x, y, `<div class="m-head">Sistema</div>${mItem('planeta', 'ph-plus-circle', 'Novo planeta')}${mItem('home', 'ph-crosshair', 'Voltar ao centro')}`, {
    planeta: () => askName('Novo planeta', 'Nome da área', t => createNode(root().id, t, true)),
    home: () => $('#cam-home').click(),
  });
}
let lastNodeMenu = 0;
function nodeMenu(id, x, y) {
  lastNodeMenu = Date.now();
  const n = S.nodes.get(id); const d = depth(id); const col = colorOf(id);
  let html = `<div class="m-head" style="--c:${col}"><span class="sw"></span><span class="t">${esc(n.title)}</span><small>${kindOf(id)}</small></div>`;
  const h = {};
  html += mItem('abrir', 'ph-arrow-up-right', 'Abrir');
  h.abrir = () => openNode(id, true);
  if (RO) return showMenu(x, y, html, h);
  if (d === 0) {
    html += mItem('planeta', 'ph-plus-circle', 'Novo planeta');
    h.planeta = () => askName('Novo planeta', 'Nome da área', t => createNode(id, t, true));
  } else {
    html += mItem('estrela', 'ph-star', d === 1 ? 'Nova estrela' : 'Novo satélite');
    h.estrela = () => askName(d === 1 ? `Nova estrela em ${n.title}` : `Novo satélite em ${n.title}`, 'Nome do tópico', t => createNode(id, t, true));
    html += mItem('renomear', 'ph-pencil-simple', 'Renomear');
    h.renomear = () => askName('Renomear', 'Novo nome', async t => { await saveNow(id, { title: t }); refreshNodeObject(id); renderLegend(); renderOtherViews(); if (S.open === id) renderDrawer(); }, n.title);
  }
  if (d === 1) {
    html += `<div class="m-sep"></div><div class="m-label">Cor do planeta</div><div class="m-swatches">${AREA.map((c, i) =>
      `<button data-m="cor" data-i="${i}" style="--c:${c}" aria-label="Cor ${i + 1}" aria-pressed="${col === c}"></button>`).join('')}</div>`;
    h.cor = async ds => { await saveNow(id, { colorIndex: +ds.i }); refreshBranch(id); renderLegend(); renderOtherViews(); applyVisuals(); if (S.open && areaOf(S.open)?.id === id) renderDrawer(); };
    if (n.pos) { html += mItem('orbita', 'ph-arrows-in', 'Voltar para a órbita padrão'); h.orbita = async () => { await saveNow(id, { pos: null }); placeBodies(); G.d3ReheatSimulation(); }; }
    if (kids(id).some(k => k.pos)) { html += mItem('soltar', 'ph-shuffle', 'Reorganizar estrelas'); h.soltar = async () => { for (const k of kids(id).filter(k => k.pos)) await saveNow(k.id, { pos: null }); pinFollowers(); G.d3ReheatSimulation(); }; }
  }
  if (d >= 2) {
    const others = planets().filter(p => p.id !== areaOf(id).id);
    html += `<div class="m-sep"></div><div class="m-label">Mover para o planeta</div><div class="m-scroll">${others.map(p =>
      `<button data-m="mover" data-to="${esc(p.id)}" style="--c:${colorOf(p.id)}"><span class="sw"></span>${esc(p.title)}</button>`).join('')}</div>`;
    h.mover = ds => moveNode(id, ds.to);
    if (n.pos) { html += mItem('soltar', 'ph-shuffle', 'Soltar posição'); h.soltar = async () => { await saveNow(id, { pos: null }); pinFollowers(); G.d3ReheatSimulation(); }; }
  }
  if (d > 0) { html += `<div class="m-sep"></div>${mItem('apagar', 'ph-trash', 'Apagar', 'class="danger"')}`; h.apagar = () => deleteNode(id); }
  showMenu(x, y, html, h);
}
addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

async function moveNode(id, to) {
  const n = S.nodes.get(id); if (!n || n.parent === to) return;
  if (to === id || descendants(id).some(d => d.id === to)) { toast('Um bloco não pode ficar dentro dele mesmo'); return; }
  const fromId = n.parent; const from = S.nodes.get(fromId)?.title;
  if (await saveNow(id, { parent: to, pos: null })) {
    syncGraph(); refreshBranch(id); [fromId, to].forEach(x => areaOf(x) && refreshNodeObject(areaOf(x).id)); renderLegend(); renderOtherViews(); applyVisuals();
    if (S.open === id) renderDrawer();
    toast(`"${n.title}" saiu de ${from} e foi para ${S.nodes.get(to).title}`);
  }
}

// diálogo de nome, no lugar do prompt do navegador
function askName(title, label, done, value = '') {
  const m = $('#ask'); $('#ask-t').textContent = title; $('#ask-l').textContent = label;
  $('#ask-f [type=submit]').textContent = value ? 'Salvar' : 'Criar';
  const inp = $('#ask-i'); inp.value = value; m.hidden = false; inp.focus(); inp.select();
  const close = () => { m.hidden = true; $('#ask-f').onsubmit = null; };
  $('#ask-f').onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); close(); if (v) done(v); };
  $('#ask-x').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  askName.cancel = close;
}

/* ---------- legenda ---------- */
function renderLegend() {
  const r = root(); if (!r) return;
  $('#legend').innerHTML = planets().map(a =>
    `<button data-id="${esc(a.id)}" class="${S.open && areaOf(S.open)?.id === a.id ? 'on' : ''}" style="--c:${colorOf(a.id)}"><span class="sw"></span>${esc(a.title)}<span class="n">${descendants(a.id).length}</span></button>`).join('')
    + (RO ? '' : `<button class="add" data-new><i class="ph-light ph-plus"></i>Novo planeta</button>`);
}
$('#legend').addEventListener('click', e => {
  if (e.target.closest('[data-new]')) return askName('Novo planeta', 'Nome da área', t => createNode(root().id, t, true));
  const b = e.target.closest('button[data-id]'); if (b) openNode(b.dataset.id, true);
});
$('#legend').addEventListener('contextmenu', e => { const b = e.target.closest('button[data-id]'); if (b) { e.preventDefault(); nodeMenu(b.dataset.id, e.clientX, e.clientY); } });
$('#legend').addEventListener('pointerover', e => { const b = e.target.closest('button[data-id]'); setHover(b ? b.dataset.id : null); });
$('#legend').addEventListener('pointerleave', () => setHover(null));

/* ---------- dossiê ---------- */
const drawer = $('#drawer'), core = $('#drawer-core');
function openNode(id, fly) {
  if (!S.nodes.has(id)) return;
  flushAll(); closeMenu();
  if (S.open !== id) { S.tab = 'plano'; S.notesMode = RO || S.nodes.get(id).notes ? 'ler' : 'editar'; S.taskOpen.clear(); }
  S.open = id; S.hover = null;
  drawer.classList.add('open'); drawer.classList.toggle('full', S.expanded); drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open');
  renderDrawer(); renderLegend();
  if (fly && S.view === 'mapa') flyTo(id);
  applyVisuals();
}
function closeDrawer() {
  flushAll();
  S.open = null;
  drawer.classList.remove('open', 'full'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open');
  renderLegend(); applyVisuals();
}
// tela cheia: o mesmo painel, ocupando a tela inteira; a escolha vale para os próximos blocos abertos
function setExpanded(on) {
  S.expanded = on; drawer.classList.toggle('full', on);
  const b = core.querySelector('[data-act="expand"]');
  if (b) { b.setAttribute('aria-pressed', on); b.title = on ? 'Voltar ao painel' : 'Tela cheia'; b.innerHTML = `<i class="ph-light ${on ? 'ph-corners-in' : 'ph-corners-out'}"></i>`; }
}
const rerenderKeep = () => { const sc = $('#d-scroll')?.scrollTop; renderDrawer(); if ($('#d-scroll')) $('#d-scroll').scrollTop = sc; renderOtherViews(); };

function summaryHTML(n) {
  const d = depth(n.id); const p = plan(n);
  const t = n.checklist || []; const tDone = t.filter(x => x.done).length;
  const hz = p.horizonte ? HORIZON.find(h => h[0] === p.horizonte)?.[1] : '';
  const pr = p.prioridade ? PRIORITY.find(x => x[0] === p.prioridade)?.[1] : '';
  if (d <= 1) {
    const r = rollup(n.id);
    const dl = r.last ? deadline(r.last, false) : null;
    return `<div class="sum">
      <div><span>Custo previsto</span><b>${money(r.prev) || 'R$ 0'}</b><small>${r.real ? `${money(r.real)} gasto` : 'nada gasto'}</small></div>
      <div><span>Última entrega</span><b>${r.last ? fmtDate(r.last) : 'Sem prazo'}</b><small class="${r.late ? 'late' : dl?.cls || ''}">${r.late ? `${r.late} atrasada${r.late > 1 ? 's' : ''}` : dl ? dl.txt : 'sem prazos'}</small></div>
      <div><span>${d === 0 ? 'Tópicos' : 'Estrelas'}</span><b>${r.done}/${r.count}</b><small>feitas</small></div>
      <div><span>Horizonte</span><b>${hz || 'Sem'}</b><small>${pr ? 'prioridade ' + pr.toLowerCase() : 'no plano'}</small></div>
    </div>`;
  }
  const dl = deadline(p.fim, n.status === 'feito');
  const over = +p.custoReal > +p.custoPrev && +p.custoPrev > 0;
  return `<div class="sum">
    <div><span>Prazo</span><b>${p.fim ? fmtDate(p.fim) : 'Sem prazo'}</b><small class="${dl?.cls || ''}">${dl ? dl.txt : 'defina no plano'}</small></div>
    <div><span>Custo</span><b>${money(p.custoPrev) || 'R$ 0'}</b><small class="${over ? 'late' : ''}">${p.custoReal ? `${money(p.custoReal)} gasto` : 'previsto'}</small></div>
    <div><span>Etapas</span><b>${tDone}/${t.length}</b><small>${t.length ? 'feitas' : 'nenhuma ainda'}</small></div>
    <div><span>Prioridade</span><b>${pr || 'Sem'}</b><small>${hz || 'sem horizonte'}</small></div>
  </div>`;
}

function renderDrawer() {
  const n = S.nodes.get(S.open); if (!n) return closeDrawer();
  const d = depth(n.id), col = colorOf(n.id), isRoot = d === 0;
  drawer.style.setProperty('--area', col);
  const crumbs = path(n.id).slice(0, -1);
  const cover = coverOf(n);
  const ch = kids(n.id);
  const tasks = n.checklist || [];
  const tabs = [
    ['plano', 'Plano', 'ph-compass', ''],
    ['tarefas', 'Checklist', 'ph-check-square', tasks.length ? `${tasks.filter(t => t.done).length}/${tasks.length}` : ''],
    ['notas', 'Notas', 'ph-text-align-left', ''],
    ['galeria', 'Fotos', 'ph-images', photos(n).length || ''],
    ['arquivos', 'Arquivos', 'ph-paperclip', docs(n).length || ''],
    ['links', 'Links', 'ph-link-simple', (n.links || []).length || ''],
  ];
  const childWord = isRoot ? ['Planetas', 'Novo planeta'] : d === 1 ? ['Estrelas', 'Nova estrela'] : ['Satélites', 'Novo satélite'];
  core.innerHTML = `
  <div class="d-scroll" id="d-scroll">
    <div class="d-top">
      <nav class="crumbs" aria-label="Caminho">${crumbs.map(c => `<button data-go="${esc(c.id)}">${esc(c.title)}</button><i class="ph-light ph-caret-right"></i>`).join('')}<span>${kindOf(n.id)}</span></nav>
      <button class="icon-btn" data-act="expand" title="${S.expanded ? 'Voltar ao painel' : 'Tela cheia'}" aria-pressed="${S.expanded}"><i class="ph-light ${S.expanded ? 'ph-corners-in' : 'ph-corners-out'}"></i></button>
      <button class="icon-btn" data-act="focus" title="Mostrar no sistema"><i class="ph-light ph-target"></i></button>
      <button class="icon-btn" data-act="close" title="Fechar (Esc)"><i class="ph-light ph-x"></i></button>
    </div>
    ${cover ? `<div class="d-cover" data-lb="${esc(fileUrl(n.id, cover))}" style="background-image:url('${esc(fileUrl(n.id, cover))}')"></div>` : ''}
    <div class="d-mark"><span class="sw"></span><span>${esc(isRoot ? 'Empresa' : areaOf(n.id).title)}</span></div>
    <textarea class="d-title" id="d-title" rows="1" placeholder="Sem título" aria-label="Título">${esc(n.title)}</textarea>
    <textarea class="d-desc" id="d-desc" rows="1" placeholder="Uma frase sobre o que é este bloco" aria-label="Descrição">${esc(n.description)}</textarea>
    ${summaryHTML(n)}
    <dl class="props">
      <dt>Dono</dt><dd class="chips" id="p-owner">${owners().map(([v, l]) => {
        const st = v === 's1' ? '--chip:var(--s1)' : v === 's2' ? '--chip:var(--s2)' : '';
        const extra = v === 's2' && n.owner === v ? ';color:var(--s2-ink)' : '';
        return `<button class="chip" data-v="${v}" aria-pressed="${(n.owner || '') === v}" style="${st}${extra}">${v === 's1' || v === 's2' ? whoHTML(v) : ''}${l}</button>`; }).join('')}</dd>
      ${isRoot ? `<dt>Sócios</dt><dd class="socios">${[0, 1].map(i => `<input id="p-socio${i}" value="${esc((n.socios || [])[i] || '')}" placeholder="${SOCIO_PADRAO[i]}" maxlength="40" autocomplete="off" aria-label="Nome do sócio ${i + 1}" ${RO ? 'disabled' : ''}>`).join('')}</dd>` : ''}
      ${isRoot ? '' : `<dt>Etapa</dt><dd class="chips" id="p-status">${STATUS.map(([v, l, c]) =>
        `<button class="chip" data-v="${v}" aria-pressed="${statusOf(n) === v}" style="--chip:${c}">${v === 'aprovacao' ? 'Aprovação' : v === 'andamento' ? 'Andamento' : l}</button>`).join('')}</dd>`}
      ${d >= 2 ? `<dt>Planeta</dt><dd><label class="select" style="--c:${col}"><span class="sw"></span><select id="p-move" aria-label="Mover para o planeta">${planets().map(p => `<option value="${esc(p.id)}" ${areaOf(n.id).id === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select><i class="ph-light ph-caret-down"></i></label></dd>` : ''}
      ${d === 1 ? `<dt>Cor</dt><dd class="swatches" id="p-color">${AREA.map((c, i) => `<button data-i="${i}" style="--c:${c}" aria-label="Cor ${i + 1}" aria-pressed="${col === c}"></button>`).join('')}</dd>` : ''}
    </dl>
    <div class="tabs" role="tablist">${tabs.map(([k, l, ic, c]) =>
      `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}"><i class="ph-light ${ic}"></i>${l}${c !== '' ? `<span class="c">${c}</span>` : ''}</button>`).join('')}</div>
    <div class="pane" id="pane">${renderPane(n)}</div>
    <section class="children">
      <h4><span>${childWord[0]}</span><span>${ch.length || ''}</span></h4>
      ${ch.map(k => { const kp = plan(k); const kdl = deadline(kp.fim, k.status === 'feito');
        return `<button class="child" data-go="${esc(k.id)}" style="--area:${colorOf(k.id)};--s:${STATUS_C[statusOf(k)]}"><span class="sw"></span><span class="t">${esc(k.title)}</span>
        <span class="meta">${kp.fim ? `<small class="${kdl?.cls || ''}">${fmtDate(kp.fim)}</small>` : ''}${kp.custoPrev ? `<small>${money(kp.custoPrev)}</small>` : ''}${whoHTML(k.owner)}${k.status ? `<span class="st" title="${esc(statusLabel(statusOf(k)))}"></span>` : ''}</span></button>`; }).join('')}
      <label class="add-row"><i class="ph-light ph-plus"></i><input id="new-child" placeholder="${childWord[1]} e Enter" aria-label="${childWord[1]}"></label>
    </section>
  </div>
  <footer class="d-foot"><span>Editado ${esc(ago(n.updatedAt))}</span>${isRoot ? '' : '<button class="icon-btn" data-act="delete" title="Apagar"><i class="ph-light ph-trash"></i></button>'}</footer>`;
  bindDrawer(n);
  if (RO) core.querySelectorAll('input, textarea, select').forEach(el => { el.readOnly = true; if (el.placeholder && !el.value) el.placeholder = 'Ainda não definido'; if (/SELECT/.test(el.tagName) || /date|number|file/.test(el.type)) el.disabled = true; });
}

function renderPane(n) {
  const id = n.id; const d = depth(id);
  if (S.tab === 'plano') {
    const p = plan(n);
    const dl = deadline(p.fim, n.status === 'feito');
    const ini = parseDate(p.inicio), fim = parseDate(p.fim);
    let bar = '';
    if (ini && fim && fim > ini) {
      const tot = fim - ini, pct = Math.max(0, Math.min(1, (today() - ini) / tot));
      bar = `<div class="field wide"><div class="timeline" style="--p:${pct * 100}%"><span class="tl-fill"></span><span class="tl-now"></span></div>
        <div class="tl-meta"><span>${fmtDate(p.inicio)}</span><span>${Math.round(tot / DAY)} dias no total</span><span>${fmtDate(p.fim)}</span></div></div>`;
    }
    const pend = (n.checklist || []).filter(t => !t.done).slice(0, 4);
    const sub = d <= 1 ? rollup(id) : null;
    const scope = d === 0 ? 'da empresa inteira' : d === 1 ? 'deste planeta' : 'desta estrela';
    return `
      <p class="plan-intro">A estratégia ${scope}: o que queremos, como, até quando e quanto custa.</p>
      <div class="plan-grid">
        <div class="field wide"><label for="pl-obj">Objetivo</label><p class="hint">O que queremos alcançar e por quê.</p>
          <textarea id="pl-obj" data-pl="objetivo" rows="2" placeholder="${d <= 1 ? 'Ex.: fechar os 10 primeiros clientes em 60 dias' : 'Ex.: ter 20 clientes usando o produto no lançamento'}">${esc(p.objetivo)}</textarea></div>
        <div class="field wide"><label for="pl-est">Estratégia</label><p class="hint">Como vamos chegar lá: a aposta principal e o que fica de fora.</p>
          <textarea id="pl-est" data-pl="estrategia" rows="4" placeholder="Ex.: começar com um grupo pequeno de clientes antes de abrir ao público">${esc(p.estrategia)}</textarea></div>
        <div class="field"><label>Horizonte</label><div class="chips" data-plc="horizonte">${HORIZON.map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${p.horizonte === v}">${l}</button>`).join('')}</div></div>
        <div class="field"><label>Prioridade</label><div class="chips" data-plc="prioridade">${PRIORITY.map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${p.prioridade === v}">${l}</button>`).join('')}</div></div>
        <div class="field"><label>Começa</label>${dateBtn(`inicio|${id}`, p.inicio)}</div>
        <div class="field"><label>Entrega</label>${dateBtn(`fim|${id}`, p.fim)}${dl ? `<p class="hint ${dl.cls}">${dl.txt}</p>` : ''}</div>
        ${bar}
        <div class="field"><label for="pl-cp">Custo previsto</label><div class="money"><span>R$</span><input type="number" min="0" step="1" inputmode="numeric" id="pl-cp" data-pl="custoPrev" value="${esc(p.custoPrev ?? '')}" placeholder="0"></div></div>
        <div class="field"><label for="pl-cr">Gasto até agora</label><div class="money"><span>R$</span><input type="number" min="0" step="1" inputmode="numeric" id="pl-cr" data-pl="custoReal" value="${esc(p.custoReal ?? '')}" placeholder="0"></div>
          ${+p.custoPrev > 0 && p.custoReal !== '' && p.custoReal != null ? `<p class="hint ${+p.custoReal > +p.custoPrev ? 'late' : ''}">${+p.custoReal > +p.custoPrev ? `${money(p.custoReal - p.custoPrev)} acima do previsto` : `${money(p.custoPrev - p.custoReal)} ainda disponível`}</p>` : ''}</div>
        <div class="field wide"><label for="pl-met">Como saber que deu certo</label><p class="hint">Um número ou sinal claro, com a meta.</p>
          <input id="pl-met" data-pl="metrica" placeholder="Ex.: 30 vendas no primeiro mês, custo por cliente abaixo de R$ 40" value="${esc(p.metrica || '')}"></div>
      </div>
      ${sub && sub.count ? `<div class="rollup"><h5>${d === 0 ? 'Somando todos os planetas' : 'Somando as estrelas deste planeta'}</h5>
        <div><span>Previsto</span><b>${money(sub.prev) || 'R$ 0'}</b></div><div><span>Gasto</span><b>${money(sub.real) || 'R$ 0'}</b></div>
        <div><span>Última entrega</span><b>${sub.last ? fmtDate(sub.last) : 'Sem prazo'}</b></div><div><span>Atrasadas</span><b class="${sub.late ? 'late' : ''}">${sub.late}</b></div></div>` : ''}
      <div class="next"><h5>Próximas etapas</h5>
        ${pend.length ? `<ul>${pend.map(t => { const tdl = deadline(t.due, false); return `<li><span class="t">${esc(t.t)}</span>${t.due ? `<small class="${tdl?.cls || ''}">${fmtDate(t.due)}</small>` : ''}${t.cost ? `<small>${money(t.cost)}</small>` : ''}${whoHTML(t.owner)}</li>`; }).join('')}</ul>` : '<p class="empty-note">Nenhuma etapa pendente.</p>'}
        <button class="link-btn" data-tab-go="tarefas">${(n.checklist || []).length ? 'Ver e editar etapas' : 'Montar o plano de ação'}<i class="ph-light ph-arrow-right"></i></button></div>`;
  }
  if (S.tab === 'notas') {
    return `<div class="notes-bar"><span>Aceita markdown. Cole uma imagem para anexar.</span>
      <div class="mini-seg"><button data-nm="ler" aria-pressed="${S.notesMode === 'ler'}">Ler</button><button data-nm="editar" aria-pressed="${S.notesMode === 'editar'}">Editar</button></div></div>
      ${S.notesMode === 'editar'
        ? `<textarea class="notes" id="notes" placeholder="Escreva aqui: contexto, decisões, ideias, próximos passos.">${esc(n.notes)}</textarea>`
        : `<div class="md" id="md">${n.notes ? md(n.notes) : '<p class="empty-note">Sem notas ainda. Clique para escrever.</p>'}</div>`}`;
  }
  if (S.tab === 'tarefas') {
    const t = n.checklist || []; const done = t.filter(x => x.done).length;
    const cost = t.reduce((s, x) => s + (+x.cost || 0), 0);
    return `${t.length ? `<div class="progress"><span>${done} de ${t.length}${cost ? `, ${money(cost)} somando as etapas` : ''}</span><span class="bar" style="--p:${done / t.length * 100}%"><i></i></span></div>` : '<p class="hint" style="margin:0 0 12px">O plano de ação: cada etapa pode ter prazo, dono e custo.</p>'}
      <ul class="tasks" id="tasks">${t.map(x => { const tdl = deadline(x.due, x.done); const open = S.taskOpen.has(x.id);
        return `<li class="task ${x.done ? 'done' : ''} ${open ? 'open' : ''}" data-tid="${x.id}">
        <button class="box" data-act="toggle" role="checkbox" aria-checked="${x.done}" aria-label="Concluir"><i class="ph-light ph-check"></i></button>
        <div class="t-main"><input class="t-name" value="${esc(x.t)}" aria-label="Etapa">
          ${!open && (x.due || x.cost || x.owner || x.flag || x.note) ? `<div class="t-meta">${x.flag ? `<span class="ck-flag sm" style="--f:${flagColor(x.flag)}">${FLAGS.find(f => f[0] === x.flag)[1]}</span>` : ''}${x.note ? '<span><i class="ph-light ph-note"></i></span>' : ''}${x.due ? `<span class="${tdl?.cls || ''}"><i class="ph-light ph-calendar-blank"></i>${fmtDate(x.due)}</span>` : ''}${x.cost ? `<span><i class="ph-light ph-coins"></i>${money(x.cost)}</span>` : ''}${whoHTML(x.owner)}</div>` : ''}
          ${open ? `<div class="t-edit">
            <label>Prazo${dateBtn(`due|${id}|${x.id}`, x.due)}</label>
            <label>Custo<span class="money sm"><span>R$</span><input type="number" min="0" data-tf="cost" value="${esc(x.cost ?? '')}" placeholder="0"></span></label>
            <label>Dono<select data-tf="owner">${owners().map(([v, l]) => `<option value="${v}" ${(x.owner || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>` : ''}
        </div>
        <button class="icon-btn more" data-act="more" aria-label="Prazo, custo e dono" title="Prazo, custo e dono" aria-pressed="${open}"><i class="ph-light ${open ? 'ph-caret-up' : 'ph-sliders-horizontal'}"></i></button>
        <button class="icon-btn del" data-act="del-task" aria-label="Remover"><i class="ph-light ph-x"></i></button></li>`; }).join('')}</ul>
      <label class="add-row"><i class="ph-light ph-plus"></i><input id="new-task" placeholder="Nova tarefa e Enter" aria-label="Nova tarefa"></label>
      ${depth(id) >= 2 ? `<button class="link-btn" data-to-ctrl="${esc(id)}" style="margin-top:14px">Abrir no Controle, com observações, destaques e anexos<i class="ph-light ph-arrow-right"></i></button>` : ''}`;
  }
  if (S.tab === 'galeria') {
    const ps = photos(n);
    return `<label class="drop" data-kind="foto"><i class="ph-light ph-images"></i><span><b>Solte fotos aqui</b> ou clique para escolher</span><input type="file" accept="image/*" multiple hidden></label>
      ${S.uploads ? `<div class="uploading">Enviando ${S.uploads} arquivo${S.uploads > 1 ? 's' : ''}</div>` : ''}
      ${ps.length ? `<div class="gallery">${ps.map(f => `<figure class="ph ${n.cover === f.id ? 'cover-on' : ''}" style="margin:0">
        <img src="${esc(fileUrl(id, f))}" alt="${esc(f.name)}" loading="lazy" data-lb="${esc(fileUrl(id, f))}">
        <div class="acts"><button data-act="cover" data-fid="${f.id}" aria-pressed="${n.cover === f.id}" title="${n.cover === f.id ? 'Tirar da capa' : 'Usar como capa'}"><i class="ph-light ph-star"></i></button>
        <button data-act="del-file" data-fid="${f.id}" title="Remover"><i class="ph-light ph-trash"></i></button></div></figure>`).join('')}</div>`
        : '<p class="empty">Nenhuma foto. A foto marcada com estrela vira a capa do bloco e aparece no mapa.</p>'}`;
  }
  if (S.tab === 'arquivos') {
    const fs = docs(n);
    const icon = f => /pdf/.test(f.type) ? 'ph-file-pdf' : /^text|markdown|csv|word|document/.test(f.type) ? 'ph-file-text' : /^image/.test(f.type) ? 'ph-image' : 'ph-file';
    return `<label class="drop" data-kind="arquivo"><i class="ph-light ph-cloud-arrow-up"></i><span><b>Solte arquivos aqui</b> ou clique para escolher</span><input type="file" multiple hidden></label>
      ${S.uploads ? `<div class="uploading">Enviando ${S.uploads} arquivo${S.uploads > 1 ? 's' : ''}</div>` : ''}
      ${fs.length ? `<ul class="files">${fs.map(f => `<li class="file"><span class="ic"><i class="ph-light ${icon(f)}"></i></span>
        <div style="min-width:0">${RO ? `<span class="fname">${esc(f.name)}</span>` : `<a href="${esc(fileUrl(id, f))}" target="_blank" rel="noopener">${esc(f.name)}</a>`}<small>${size(f.size)}, ${esc(ago(f.at))}${f.task && taskName(n, f.task) ? ` · <span class="from-task"><i class="ph-light ph-check-square"></i>${esc(taskName(n, f.task))}</span>` : ''}</small></div>
        <div class="row-acts"><a class="icon-btn" href="${esc(fileUrl(id, f))}?baixar=${encodeURIComponent(f.name)}" title="Baixar"><i class="ph-light ph-download"></i></a>
        <button class="icon-btn" data-act="del-file" data-fid="${f.id}" title="Remover"><i class="ph-light ph-trash"></i></button></div></li>`).join('')}</ul>`
        : '<p class="empty">Nenhum arquivo. PDFs, planilhas, fichas técnicas e vetores cabem aqui.</p>'}`;
  }
  const ls = n.links || [];
  return `<form class="link-form" id="link-form"><input name="url" placeholder="Endereço do link" aria-label="Endereço" required><input name="t" placeholder="Nome (opcional)" aria-label="Nome"><button class="btn" type="submit">Adicionar</button></form>
    ${ls.length ? `<ul class="links">${ls.map(l => { let host = l.url; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch {}
      return `<li class="link"><span class="ic">${esc(host[0] || '')}</span><div style="min-width:0"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.t || host)}</a><small>${esc(host)}${l.task && taskName(n, l.task) ? ` · <span class="from-task"><i class="ph-light ph-check-square"></i>${esc(taskName(n, l.task))}</span>` : ''}</small></div>
      <button class="icon-btn" data-act="del-link" data-lid="${l.id}" title="Remover"><i class="ph-light ph-trash"></i></button></li>`; }).join('')}</ul>`
      : '<p class="empty">Nenhum link. Referências, fornecedores, pastas no Drive, perfis.</p>'}`;
}

function bindDrawer(n) {
  const id = n.id;
  const title = $('#d-title'), desc = $('#d-desc');
  title.addEventListener('input', () => { queue(id, 'title', title.value.replace(/\n/g, ' ')); liveLabel(id); });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); desc.focus(); } });
  desc.addEventListener('input', () => queue(id, 'description', desc.value));
  core.querySelectorAll('[id^="p-socio"]').forEach(inp => inp.addEventListener('change', async () => {
    await saveNow(id, { socios: [0, 1].map(i => ($('#p-socio' + i)?.value || '').trim().slice(0, 40)) });
    refreshSocios(); rerenderKeep();
  }));
  core.querySelectorAll('#p-owner .chip').forEach(b => b.addEventListener('click', async () => { await saveNow(id, { owner: b.dataset.v }); rerenderKeep(); refreshBranch(id); applyVisuals(); }));
  core.querySelectorAll('#p-status .chip').forEach(b => b.addEventListener('click', async () => { await saveNow(id, { status: b.dataset.v }); rerenderKeep(); refreshNodeObject(id); applyVisuals(); }));
  $('#p-move')?.addEventListener('change', e => moveNode(id, e.target.value));
  core.querySelectorAll('#p-color button').forEach(b => b.addEventListener('click', async () => { await saveNow(id, { colorIndex: +b.dataset.i }); refreshBranch(id); renderLegend(); rerenderKeep(); applyVisuals(); }));
  core.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { flushAll(); S.tab = b.dataset.tab; rerenderKeep(); }));
  core.querySelectorAll('[data-tab-go]').forEach(b => b.addEventListener('click', () => { flushAll(); S.tab = b.dataset.tabGo; rerenderKeep(); }));
  core.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => openNode(b.dataset.go, true)));
  core.querySelector('[data-act="close"]').addEventListener('click', closeDrawer);
  core.querySelector('[data-act="expand"]').addEventListener('click', () => setExpanded(!S.expanded));
  core.querySelector('[data-act="focus"]').addEventListener('click', () => { if (S.expanded) setExpanded(false); if (S.view !== 'mapa') setView('mapa'); flyTo(id); });
  core.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteNode(id));
  core.querySelectorAll('[data-lb]').forEach(el => el.addEventListener('click', () => lightbox(el.dataset.lb)));
  core.querySelector('[data-to-ctrl]')?.addEventListener('click', ev => { const tid = ev.currentTarget.dataset.toCtrl; closeDrawer(); setView('controle'); pickBlock(tid); });

  const nc = $('#new-child');
  nc.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !nc.value.trim()) return;
    const t = nc.value.trim(); nc.value = '';
    await createNode(id, t, false);
    rerenderKeep(); $('#new-child').focus();
  });

  // plano
  const setPlan = (k, v, delay) => queue(id, 'plan', { ...plan(S.nodes.get(id)), [k]: v }, delay);
  core.querySelectorAll('[data-pl]').forEach(el => {
    const k = el.dataset.pl; const num = el.type === 'number';
    el.addEventListener('input', () => setPlan(k, num ? (el.value === '' ? '' : +el.value) : el.value, 500));
    if (num) el.addEventListener('change', () => { flushAll(); rerenderKeep(); });
  });
  core.querySelectorAll('[data-plc]').forEach(group => group.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const k = group.dataset.plc; const cur = plan(S.nodes.get(id))[k];
    flushAll();
    saveNow(id, { plan: { ...plan(S.nodes.get(id)), [k]: cur === b.dataset.v ? '' : b.dataset.v } }).then(rerenderKeep);
  }));

  // notas
  core.querySelectorAll('[data-nm]').forEach(b => b.addEventListener('click', () => { flushAll(); S.notesMode = b.dataset.nm; rerenderKeep(); if (S.notesMode === 'editar') $('#notes')?.focus(); }));
  const notes = $('#notes');
  if (notes) {
    notes.addEventListener('input', () => queue(id, 'notes', notes.value, 600));
    notes.addEventListener('paste', async e => {
      const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      const named = new File([f], `colado-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type });
      const r = await uploadFiles(id, [named], true);
      if (r[0]) { const ins = `\n![](${fileUrl(id, r[0])})\n`; const p = notes.selectionStart; notes.value = notes.value.slice(0, p) + ins + notes.value.slice(notes.selectionEnd); queue(id, 'notes', notes.value, 100); }
    });
  }
  $('#md')?.addEventListener('click', e => { if (e.target.closest('a')) return; if (e.target.tagName === 'IMG') { lightbox(e.target.src); return; } if (RO) return; S.notesMode = 'editar'; rerenderKeep(); $('#notes')?.focus(); });

  // etapas
  const tasks = $('#tasks');
  const list = () => S.nodes.get(id).checklist || [];
  if (tasks) {
    tasks.addEventListener('click', e => {
      const li = e.target.closest('.task'); if (!li) return;
      const tid = li.dataset.tid; const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle') saveNow(id, { checklist: list().map(x => x.id === tid ? { ...x, done: !x.done } : x) }).then(rerenderKeep);
      if (act === 'del-task') saveNow(id, { checklist: list().filter(x => x.id !== tid) }).then(rerenderKeep);
      if (act === 'more') { flushAll(); S.taskOpen.has(tid) ? S.taskOpen.delete(tid) : S.taskOpen.add(tid); rerenderKeep(); }
    });
    tasks.addEventListener('input', e => {
      const li = e.target.closest('.task'); if (!li) return;
      const tid = li.dataset.tid;
      if (e.target.classList.contains('t-name')) queue(id, 'checklist', list().map(x => x.id === tid ? { ...x, t: e.target.value } : x));
      const tf = e.target.dataset.tf;
      if (tf) queue(id, 'checklist', list().map(x => x.id === tid ? { ...x, [tf]: tf === 'cost' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value } : x), 300);
    });
    tasks.addEventListener('change', e => { if (e.target.dataset.tf) flushAll(); });
    tasks.addEventListener('keydown', e => {
      const li = e.target.closest('.task'); if (!li || !e.target.classList.contains('t-name')) return;
      if (e.key === 'Enter') { e.preventDefault(); $('#new-task').focus(); }
      if (e.key === 'Backspace' && !e.target.value) { e.preventDefault(); saveNow(id, { checklist: list().filter(x => x.id !== li.dataset.tid) }).then(rerenderKeep).then(() => $('#new-task').focus()); }
    });
  }
  const nt = $('#new-task');
  nt?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !nt.value.trim()) return;
    const t = nt.value.trim(); nt.value = '';
    await saveNow(id, { checklist: [...list(), { id: uid(), t, done: false }] });
    rerenderKeep(); $('#new-task').focus();
  });

  // anexos
  const drop = core.querySelector('.drop');
  if (drop) {
    const input = drop.querySelector('input');
    input.addEventListener('change', () => { uploadFiles(id, [...input.files], drop.dataset.kind === 'foto'); });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  }
  core.querySelectorAll('[data-act="cover"]').forEach(b => b.addEventListener('click', async () => {
    const cur = S.nodes.get(id).cover; await saveNow(id, { cover: cur === b.dataset.fid ? null : b.dataset.fid });
    rerenderKeep(); refreshNodeObject(id); applyVisuals();
  }));
  core.querySelectorAll('[data-act="del-file"]').forEach(b => b.addEventListener('click', async () => {
    const f = (S.nodes.get(id).files || []).find(x => x.id === b.dataset.fid);
    if (!(await confirmDialog('Remover anexo?', `"${f?.name}" sai deste bloco e vai para a lixeira da pasta de dados.`, 'Remover'))) return;
    try { const fresh = await api.removeFile(id, b.dataset.fid); recentSelf.set(id, Date.now()); adopt(id, fresh); rerenderKeep(); refreshNodeObject(id); applyVisuals(); }
    catch (e) { toast('Não removeu: ' + e.message); }
  }));

  // links
  $('#link-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target); let url = String(fd.get('url') || '').trim(); const t = String(fd.get('t') || '').trim();
    if (!url) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { toast('Esse endereço não parece um link'); return; }
    await saveNow(id, { links: [...(S.nodes.get(id).links || []), { id: uid(), url, t, at: Date.now() }] });
    rerenderKeep();
  });
  core.querySelectorAll('[data-act="del-link"]').forEach(b => b.addEventListener('click', async () => {
    await saveNow(id, { links: (S.nodes.get(id).links || []).filter(x => x.id !== b.dataset.lid) }); rerenderKeep();
  }));
}

// nomes dos sócios mudaram: atualiza filtros fixos, rótulos do mapa e as outras telas
function refreshSocios() {
  document.querySelectorAll('[data-nome]').forEach(e => { e.textContent = nomeDe(e.dataset.nome); });
  document.querySelectorAll('[data-ini]').forEach(e => { e.textContent = inicial(e.dataset.ini); });
  for (const id of objs.keys()) if (depth(id) >= 2) liveLabel(id);
  renderOtherViews();
}

function liveLabel(id) {
  const g = objs.get(id); const n = S.nodes.get(id); if (!g || !n) return;
  const el = g.userData.label; const d = depth(id);
  if (d === 0) el.innerHTML = sunSVG(n.title);
  else if (d === 1) el.innerHTML = `${esc(n.title)}<span class="n">${descendants(id).length}</span>`;
  else if (d >= 2) el.innerHTML = `${whoHTML(n.owner)}${esc(n.title)}`;
  clearTimeout(liveLabel.t); liveLabel.t = setTimeout(() => { renderLegend(); renderOtherViews(); }, 500);
}

let dragDepth = 0;
drawer.addEventListener('dragenter', e => { if (!S.open || !e.dataTransfer?.types?.includes('Files')) return; dragDepth++; drawer.classList.add('dragging'); });
drawer.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drawer.classList.remove('dragging'); } });
drawer.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
drawer.addEventListener('drop', e => {
  if (!S.open || !e.dataTransfer?.files?.length) return;
  e.preventDefault(); dragDepth = 0; drawer.classList.remove('dragging');
  const files = [...e.dataTransfer.files];
  const imgs = files.filter(f => f.type.startsWith('image/')), rest = files.filter(f => !f.type.startsWith('image/'));
  const id = S.open;
  if (imgs.length) { S.tab = 'galeria'; uploadFiles(id, imgs, true); }
  if (rest.length) { if (!imgs.length) S.tab = 'arquivos'; uploadFiles(id, rest, false); }
});
addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });

async function uploadFiles(id, files, asPhoto) {
  if (!files.length) return [];
  S.uploads += files.length; if (S.open === id) renderDrawer();
  const out = [];
  for (const f of files) {
    try { const r = await api.upload(id, f, asPhoto ? 'foto' : 'arquivo'); recentSelf.set(id, Date.now()); adopt(id, r.node); out.push(r.item); }
    catch (e) { toast(`Não enviou ${f.name}: ${e.message}`); }
    S.uploads--;
  }
  const n = S.nodes.get(id);
  if (asPhoto && !n.cover && photos(n).length) { await saveNow(id, { cover: photos(n)[0].id }); refreshNodeObject(id); applyVisuals(); }
  if (S.open === id) renderDrawer();
  renderOtherViews();
  if (out.length) toast(out.length === 1 ? `${out[0].name} anexado` : `${out.length} arquivos anexados`);
  return out;
}

async function createNode(parentId, title, open, extra = {}) {
  const p = S.nodes.get(parentId);
  const data = { parent: parentId, title, order: Date.now(), ...extra };
  if (!p.parent) { const used = new Set(planets().map(k => k.colorIndex)); data.colorIndex = [0, 1, 2, 3, 4, 5, 6, 7].find(i => !used.has(i)) ?? planets().length % 8; }
  try {
    const n = await api.create(data);
    recentSelf.set(n.id, Date.now());
    adopt(n.id, n);
    syncGraph(); if (areaOf(n.id)) refreshNodeObject(areaOf(n.id).id); renderLegend(); renderOtherViews();
    if (open) openNode(n.id, true);
    toast(`"${title}" criado em ${p.title}`);
    return n;
  } catch (e) { toast('Não criou: ' + e.message); }
}

async function deleteNode(id) {
  const n = S.nodes.get(id); const sub = descendants(id).length;
  const ok = await confirmDialog(`Apagar "${n.title}"?`, `${sub ? `Os ${sub} tópicos dentro dele também saem do mapa. ` : ''}Tudo vai para a lixeira da pasta de dados e pode ser recuperado de lá.`, 'Apagar');
  if (!ok) return;
  try {
    const r = await api.remove(id);
    r.removidos.forEach(x => { S.nodes.delete(x); recentSelf.set(x, Date.now()); });
    const parent = n.parent; const wasOpen = !!S.open;
    if (S.open && !S.nodes.has(S.open)) closeDrawer();
    syncGraph(); if (parent && S.nodes.has(parent) && areaOf(parent)) refreshNodeObject(areaOf(parent).id); renderLegend(); renderOtherViews();
    if (parent && wasOpen && S.view === 'mapa') openNode(parent, true);
    toast(`"${n.title}" apagado`);
  } catch (e) { toast('Não apagou: ' + e.message); }
}

/* ---------- índice ---------- */
const indexEl = $('#index');
function renderIndex() {
  const r = root(); if (!r) return;
  const all = descendants(r.id);
  const leaves = all.filter(n => depth(n.id) >= 2);
  const openTasks = all.reduce((s, n) => s + (n.checklist || []).filter(t => !t.done).length, 0);
  const ru = rollup(r.id);
  const keep = indexEl.scrollTop;
  indexEl.innerHTML = `<div class="index-wrap">
    <header class="index-head"><div><p class="eyebrow"><i class="ph-light ph-squares-four"></i>Índice</p><h1 class="hl"><b>${esc(r.title || 'Sua empresa')}.</b> <span>Todas as áreas e estrelas, num só lugar.</span></h1>${r.description ? `<p>${esc(r.description)}</p>` : ''}</div>
      <div class="stats"><div class="stat"><b>${planets().length}</b><span>planetas</span></div><div class="stat"><b>${leaves.length}</b><span>estrelas</span></div>
      <div class="stat"><b>${openTasks}</b><span>etapas abertas</span></div><div class="stat"><b>${money(ru.prev) || 'R$ 0'}</b><span>custo previsto</span></div></div></header>
    ${planets().filter(a => matches(a.id)).map(a => {
      const ls = kids(a.id).filter(l => matches(l.id)); const ar = rollup(a.id); const ap = plan(a);
      return `<section class="area-block" style="--c:${colorOf(a.id)};--area:${colorOf(a.id)}">
        <div class="area-title"><button data-go="${esc(a.id)}"><h2>${esc(a.title)}</h2></button><p>${esc(ap.estrategia || a.description)}</p>
          <div class="meta">${whoHTML(a.owner)}<span>${a.owner ? '' : 'Sem dono'}</span><span>${ar.count} estrelas</span>${ar.prev ? `<span>${money(ar.prev)}</span>` : ''}</div></div>
        <div class="leaf-list">${ls.map(l => cardHTML(l, 'leaf')).join('')}
          <button class="leaf add" data-new="${esc(a.id)}"><span><i class="ph-light ph-plus"></i> Nova estrela</span></button></div></section>`; }).join('')}
  </div>`;
  indexEl.scrollTop = keep;
}
function cardHTML(l, cls) {
  const t = l.checklist || []; const cov = coverOf(l); const sub = descendants(l.id).length; const p = plan(l);
  const dl = deadline(p.fim, l.status === 'feito');
  const tag = cls === 'card' ? 'div' : 'button';
  return `<${tag} class="${cls}" data-go="${esc(l.id)}" data-id="${esc(l.id)}" style="--c:${colorOf(l.id)}" ${cls === 'card' ? 'tabindex="0" role="button"' : ''}>
    ${cov ? `<span class="cover" style="background-image:url('${esc(fileUrl(l.id, cov))}')"></span>` : ''}
    ${cls === 'card' ? `<span class="card-area"><span class="sw"></span><span class="t">${esc(areaOf(l.id).title)}</span>${p.prioridade === 'alta' ? '<span class="prio">Alta</span>' : ''}</span>` : ''}
    <h3>${esc(l.title)}</h3>${p.estrategia ? `<p>${esc(p.estrategia)}</p>` : l.description ? `<p>${esc(l.description)}</p>` : ''}
    <span class="foot">${cls === 'leaf' && l.status ? `<span class="pill" style="--s:${STATUS_C[statusOf(l)]}">${esc(statusLabel(statusOf(l)))}</span>` : ''}
      ${p.fim ? `<span class="${dl?.cls || ''}"><i class="ph-light ph-calendar-blank"></i>${fmtDate(p.fim)}</span>` : ''}
      ${p.custoPrev ? `<span><i class="ph-light ph-coins"></i>${money(p.custoPrev)}</span>` : ''}
      ${t.length ? `<span><i class="ph-light ph-check-square"></i>${t.filter(x => x.done).length}/${t.length}</span>` : ''}
      ${photos(l).length ? `<span><i class="ph-light ph-images"></i>${photos(l).length}</span>` : ''}
      ${docs(l).length ? `<span><i class="ph-light ph-paperclip"></i>${docs(l).length}</span>` : ''}
      ${(l.links || []).length ? `<span><i class="ph-light ph-link-simple"></i>${l.links.length}</span>` : ''}
      ${sub ? `<span><i class="ph-light ph-tree"></i>${sub}</span>` : ''}<span class="grow"></span>${whoHTML(l.owner || '')}</span></${tag}>`;
}
indexEl.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]'); if (go) return openNode(go.dataset.go, false);
  const nw = e.target.closest('[data-new]'); if (nw) askName(`Nova estrela em ${S.nodes.get(nw.dataset.new).title}`, 'Nome do tópico', t => createNode(nw.dataset.new, t, true));
});

/* ---------- quadro ---------- */
const boardEl = $('#board');
const boardKey = n => n.boardOrder ?? (n.order || 0);
function boardItems() {
  return [...S.nodes.values()].filter(n => depth(n.id) >= 2 && (!S.boardArea || areaOf(n.id)?.id === S.boardArea) && selfMatch(n.id));
}
function renderBoard() {
  const items = boardItems();
  const keep = boardEl.querySelector('.cols')?.scrollLeft || 0;
  const late = items.filter(n => n.status !== 'feito' && parseDate(plan(n).fim) && parseDate(plan(n).fim) < today()).length;
  const prev = items.reduce((s, n) => s + (+plan(n).custoPrev || 0), 0);
  boardEl.innerHTML = `<div class="board-head">
      <div><p class="eyebrow"><i class="ph-light ph-kanban"></i>Quadro</p><h1 class="hl"><b>Do solto ao entregue.</b> <span>Cada estrela vira um card.</span></h1><p>Arraste entre as colunas para mudar a etapa.</p></div>
      <div class="stats"><div class="stat"><b>${items.length}</b><span>cards</span></div><div class="stat"><b>${money(prev) || 'R$ 0'}</b><span>previsto</span></div><div class="stat"><b class="${late ? 'late' : ''}">${late}</b><span>atrasados</span></div></div>
    </div>
    <div class="area-filter">${[['', 'Todos os planetas', INK], ...planets().map(p => [p.id, p.title, colorOf(p.id)])].map(([v, l, c]) =>
      `<button data-area="${esc(v)}" aria-pressed="${S.boardArea === v}" style="--c:${c}">${v ? '<span class="sw"></span>' : ''}${esc(l)}</button>`).join('')}</div>
    <div class="cols">${STATUS.map(([v, l, c, hint]) => {
      const col = items.filter(n => statusOf(n) === v).sort((a, b) => boardKey(a) - boardKey(b));
      const cost = col.reduce((s, n) => s + (+plan(n).custoPrev || 0), 0);
      return `<section class="col" data-col="${v}" style="--s:${c}">
        <header><div class="col-t"><span class="dot"></span><h2>${l}</h2><span class="n">${col.length}</span>${cost ? `<span class="cost">${money(cost)}</span>` : ''}</div><p>${hint}</p></header>
        <div class="col-cards" data-col="${v}">${col.map(n => cardHTML(n, 'card')).join('') || '<p class="col-empty">Arraste um card para cá</p>'}</div>
        <form class="col-add" data-col="${v}"><div class="row"><i class="ph-light ph-plus"></i><input placeholder="Novo card" aria-label="Novo card em ${l}"></div>
          <label class="select sm"><select aria-label="Planeta do novo card">${planets().map(p => `<option value="${esc(p.id)}" ${(S.boardArea || planets()[0].id) === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select><i class="ph-light ph-caret-down"></i></label></form>
      </section>`; }).join('')}</div>`;
  boardEl.querySelector('.cols').scrollLeft = keep;
}
boardEl.addEventListener('click', e => {
  const a = e.target.closest('[data-area]'); if (a) { S.boardArea = a.dataset.area; renderBoard(); }
});
boardEl.addEventListener('keydown', e => { const c = e.target.closest('.card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNode(c.dataset.id, false); } });
boardEl.addEventListener('submit', async e => {
  const f = e.target.closest('.col-add'); if (!f) return;
  e.preventDefault();
  const t = f.querySelector('input').value.trim(); if (!t) return;
  const parent = f.querySelector('select').value; const col = f.dataset.col;
  const cards = [...S.nodes.values()].filter(n => depth(n.id) >= 2 && statusOf(n) === col);
  const last = cards.length ? Math.max(...cards.map(boardKey)) : 0;
  const n = await createNode(parent, t, false, { status: col, boardOrder: last + 1000 });
  if (n) { renderBoard(); boardEl.querySelector(`.col-add[data-col="${col}"] input`)?.focus(); }
});

// arrastar cards: o card flutua sob o cursor e uma linha mostra onde ele vai cair
const ghostLine = document.createElement('div'); ghostLine.className = 'drop-line';
let bd = null;
function dropIndex(list, y) {
  const cards = [...list.querySelectorAll('.card:not(.lifting)')];
  for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return { i, cards }; }
  return { i: cards.length, cards };
}
function colAt(x, y) {
  if (bd?.float) bd.float.style.visibility = 'hidden';
  const el = document.elementFromPoint(x, y);
  if (bd?.float) bd.float.style.visibility = '';
  return el?.closest?.('.col') || null;
}
boardEl.addEventListener('pointerdown', e => {
  const c = e.target.closest('.card'); if (!c || e.button !== 0) return;
  bd = { id: c.dataset.id, el: c, x: e.clientX, y: e.clientY, started: false, pid: e.pointerId };
});
addEventListener('pointermove', e => {
  if (!bd || RO) return;
  if (!bd.started) {
    if (Math.hypot(e.clientX - bd.x, e.clientY - bd.y) < 6) return;
    bd.started = true;
    const r = bd.el.getBoundingClientRect();
    bd.dx = e.clientX - r.left; bd.dy = e.clientY - r.top;
    bd.float = bd.el.cloneNode(true); bd.float.classList.add('floating'); bd.float.style.width = r.width + 'px';
    document.body.appendChild(bd.float);
    bd.el.classList.add('lifting'); document.body.classList.add('board-dragging');
  }
  bd.float.style.transform = `translate(${e.clientX - bd.dx}px, ${e.clientY - bd.dy}px) rotate(2deg)`;
  const col = colAt(e.clientX, e.clientY);
  boardEl.querySelectorAll('.col.over').forEach(c => c !== col && c.classList.remove('over'));
  if (!col) { ghostLine.remove(); return; }
  col.classList.add('over');
  const list = col.querySelector('.col-cards'); list.querySelector('.col-empty')?.remove();
  const { i, cards } = dropIndex(list, e.clientY);
  if (cards[i]) list.insertBefore(ghostLine, cards[i]); else list.appendChild(ghostLine);
  // rola as colunas quando o card chega perto da borda
  const cols = boardEl.querySelector('.cols'); const cr = cols.getBoundingClientRect();
  if (e.clientX > cr.right - 60) cols.scrollLeft += 14; else if (e.clientX < cr.left + 60) cols.scrollLeft -= 14;
});
addEventListener('pointerup', async e => {
  if (!bd) return;
  const d = bd; bd = null;
  if (!d.started) { if (d.el.isConnected && e.target.closest?.('.card') === d.el) openNode(d.id, false); return; }
  const col = colAt(e.clientX, e.clientY);
  d.float.remove(); document.body.classList.remove('board-dragging');
  boardEl.querySelectorAll('.col.over').forEach(c => c.classList.remove('over'));
  if (!col) { ghostLine.remove(); d.el.classList.remove('lifting'); return; }
  const list = col.querySelector('.col-cards'); const v = col.dataset.col;
  const { i, cards } = dropIndex(list, e.clientY);
  ghostLine.remove();
  const keys = cards.map(c => boardKey(S.nodes.get(c.dataset.id)));
  const before = i > 0 ? keys[i - 1] : null, after = i < keys.length ? keys[i] : null;
  const key = before == null && after == null ? 1000 : before == null ? after - 1000 : after == null ? before + 1000 : (before + after) / 2;
  const n = S.nodes.get(d.id); const changed = statusOf(n) !== v;
  await saveNow(d.id, { status: v, boardOrder: key });
  renderBoard(); refreshNodeObject(d.id); applyVisuals();
  if (S.open === d.id) renderDrawer();
  if (changed) toast(`"${n.title}" agora está em ${statusLabel(v)}`);
});
addEventListener('pointercancel', () => { if (bd?.started) { bd.float.remove(); bd.el.classList.remove('lifting'); ghostLine.remove(); document.body.classList.remove('board-dragging'); } bd = null; });


/* ---------- controle: checklist de cada bloco ---------- */
const ctrlEl = $('#controle');
const FLAGS = [['', 'Não urgente', 'var(--faint)'], ['atencao', 'Atenção', '#ffd166'], ['urgente', 'Urgente', '#ff8f7a']];
const flagColor = f => (FLAGS.find(x => x[0] === (f || '')) || FLAGS[0])[2];
const ownerCycle = o => ({ '': 's1', s1: 's2', s2: 'ambos', ambos: '' }[o || '']);
const ownerName = o => o === 'ambos' ? 'Os dois' : nomeDe(o) || 'Ninguém';
const blocks = () => [...S.nodes.values()].filter(n => depth(n.id) >= 2);
const tasksOf = n => n.checklist || [];
const taskPhotos = (n, tid) => photos(n).filter(f => f.task === tid);
// arquivos e links de um subprocesso ficam no próprio bloco, marcados com a tarefa:
// assim aparecem também no card do Quadro e nas abas Fotos, Arquivos e Links do painel
const taskDocs = (n, tid) => docs(n).filter(f => f.task === tid);
const taskLinks = (n, tid) => (n.links || []).filter(l => l.task === tid);
const taskName = (n, tid) => tasksOf(n).find(x => x.id === tid)?.t || '';
const fileIcon = f => /pdf/.test(f.type) ? 'ph-file-pdf' : /^text|markdown|csv|word|document/.test(f.type) ? 'ph-file-text' : /sheet|excel/.test(f.type) ? 'ph-file-xls' : /^image/.test(f.type) ? 'ph-image' : 'ph-file';
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
function attachHTML(n, x) {
  const ph = taskPhotos(n, x.id), fs = taskDocs(n, x.id), ls = taskLinks(n, x.id);
  const total = ph.length + fs.length + ls.length;
  return `<div class="ck-field wide att"><span>Anexos${total ? ` · ${total}` : ''}</span>
    ${RO ? '' : `<div class="att-acts">
      <label class="att-btn"><i class="ph-light ph-camera"></i>Foto<input type="file" accept="image/*" multiple hidden data-photo></label>
      <label class="att-btn"><i class="ph-light ph-paperclip"></i>Arquivo<input type="file" multiple hidden data-file></label>
      <button type="button" class="att-btn" data-addlink aria-expanded="${S.ctrlLink === x.id}"><i class="ph-light ph-link-simple"></i>Link</button>
    </div>`}
    ${!RO && S.ctrlLink === x.id ? `<form class="att-link" data-linkform><input name="url" placeholder="Endereço do link" aria-label="Endereço do link" autocomplete="off" required><input name="t" placeholder="Nome (opcional)" aria-label="Nome do link" autocomplete="off"><button class="btn" type="submit">Adicionar</button></form>` : ''}
    ${ph.length ? `<div class="ck-photos">${ph.map(f => `<figure><img src="${esc(fileUrl(n.id, f))}" alt="${esc(f.name)}" loading="lazy" data-lb="${esc(fileUrl(n.id, f))}">${RO ? '' : `<button data-delph="${f.id}" aria-label="Remover foto"><i class="ph-light ph-x"></i></button>`}</figure>`).join('')}</div>` : ''}
    ${fs.length || ls.length ? `<ul class="att-list">
      ${fs.map(f => `<li><span class="ic"><i class="ph-light ${fileIcon(f)}"></i></span><div>${RO ? `<b>${esc(f.name)}</b>` : `<a href="${esc(fileUrl(n.id, f))}" target="_blank" rel="noopener">${esc(f.name)}</a>`}<small>${size(f.size)}, ${esc(ago(f.at))}</small></div>
        ${RO ? '' : `<a class="icon-btn" href="${esc(fileUrl(n.id, f))}?baixar=${encodeURIComponent(f.name)}" title="Baixar"><i class="ph-light ph-download-simple"></i></a><button class="icon-btn" data-delph="${f.id}" title="Remover"><i class="ph-light ph-trash"></i></button>`}</li>`).join('')}
      ${ls.map(l => `<li><span class="ic link">${esc(hostOf(l.url)[0] || '')}</span><div><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.t || hostOf(l.url))}</a><small>${esc(hostOf(l.url))}</small></div>
        ${RO ? '' : `<button class="icon-btn" data-dellink="${l.id}" title="Remover"><i class="ph-light ph-trash"></i></button>`}</li>`).join('')}
    </ul>` : ''}
    ${!total ? `<p class="att-empty">${RO ? 'Nada anexado.' : 'Solte aqui fotos e arquivos, cole uma imagem ou adicione um link. Tudo aparece também no card do Quadro e no bloco.'}</p>` : ''}
  </div>`;
}
// envia para o subprocesso: imagens viram fotos, o resto vira arquivo
async function uploadToTask(n, tid, files) {
  if (!files.length) return;
  toast(`Enviando ${files.length} anexo${files.length > 1 ? 's' : ''}`);
  let ok = 0;
  for (const f of files) {
    try { const r = await api.upload(n.id, f, f.type.startsWith('image/') ? 'foto' : 'arquivo', tid); recentSelf.set(n.id, Date.now()); adopt(n.id, r.node); ok++; }
    catch (er) { toast(`Não enviou ${f.name}: ${er.message}`); }
  }
  // primeira foto do bloco vira a capa, igual ao painel: o card do Quadro e o planeta mostram
  const cur = S.nodes.get(n.id);
  if (!cur.cover && photos(cur).length) await saveNow(n.id, { cover: photos(cur)[0].id });
  afterTasks();
  if (ok) toast(ok === 1 ? `Anexado em "${taskName(cur, tid)}"` : `${ok} anexos em "${taskName(cur, tid)}"`);
}
// atraso é calculado, nunca digitado: passou do prazo sem estar feito
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isLate = x => !x.done && parseDate(x.due) != null && parseDate(x.due) < today();
const daysLate = due => Math.round((today() - parseDate(due)) / DAY);
const macroLate = n => n.status !== 'feito' && parseDate(plan(n).fim) != null && parseDate(plan(n).fim) < today();
const afterFinal = (n, x) => !x.done && okDate(x.due) && okDate(plan(n).fim) && x.due > plan(n).fim;
const stats = n => { const t = tasksOf(n); const done = t.filter(x => x.done).length; return { total: t.length, done, open: t.length - done, urgent: t.filter(x => !x.done && x.flag === 'urgente').length, late: t.filter(isLate).length + (macroLate(n) ? 1 : 0) }; };

// busca: cada palavra precisa aparecer em algum lugar do bloco (nome, planeta, tarefas, observações)
function ctrlSearch() {
  const terms = fold(S.ctrlQuery).split(/\s+/).filter(Boolean);
  const out = [];
  for (const n of blocks()) {
    const st = stats(n);
    if (S.ctrlFilter === 'pendentes' && !st.open) continue;
    if (S.ctrlFilter === 'urgentes' && !st.urgent) continue;
    if (S.ctrlFilter === 'atraso' && !st.late) continue;
    if ((S.ctrlFilter === 's1' || S.ctrlFilter === 's2') && !(ownersOf(effOwner(n.id)).includes(S.ctrlFilter) || tasksOf(n).some(x => !x.done && ownersOf(x.owner).includes(S.ctrlFilter)))) continue;
    let score = 0, hit = '';
    if (terms.length) {
      const title = fold(n.title), area = fold(areaOf(n.id).title), desc = fold(n.description);
      let ok = true;
      for (const term of terms) {
        if (title.startsWith(term)) score += 100; else if (title.includes(term)) score += 70;
        else if (area.includes(term)) score += 40;
        else if (desc.includes(term)) score += 20;
        else { const tk = tasksOf(n).find(x => fold(x.t).includes(term) || fold(x.note).includes(term)); if (tk) { score += 30; hit = hit || tk.t; } else { ok = false; break; } }
      }
      if (!ok) continue;
    }
    out.push({ n, st, score, hit });
  }
  return out;
}
const mark = (text, terms) => { let s = esc(text); for (const t of terms) { if (!t) continue; const f = fold(text); const i = f.indexOf(t); if (i >= 0) { const raw = text.slice(i, i + t.length); s = s.replace(esc(raw), `<mark>${esc(raw)}</mark>`); } } return s; };

function ringSVG(pct, col) {
  const r = 34, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 80 80" style="--c:${col}"><circle cx="40" cy="40" r="${r}" class="ring-bg"/><circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
}
function ctrlTaskRow(n, x) {
  const ph = taskPhotos(n, x.id); const open = S.ctrlOpen === x.id; const dl = deadline(x.due, x.done); const late = isLate(x);
  return `<li class="ck ${x.done ? 'done' : ''} ${x.flag ? 'flag-' + x.flag : ''} ${late ? 'late' : ''} ${open ? 'open' : ''}" data-tid="${x.id}" style="--f:${flagColor(x.flag)}">
    <div class="ck-row">
      ${x.done || RO || S.ctrlSort === 'prazo' ? '' : '<span class="ck-grip" title="Arraste para reordenar"><i class="ph-light ph-dots-six-vertical"></i></span>'}
      <button class="ck-box" data-act="toggle" role="checkbox" aria-checked="${x.done}" aria-label="Marcar como feito"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>
      <input class="ck-t" value="${esc(x.t)}" aria-label="Tarefa" ${RO ? 'readonly' : ''}>
      <div class="ck-badges">
        ${x.flag ? `<span class="ck-flag">${FLAGS.find(f => f[0] === x.flag)[1]}</span>` : ''}
        ${late ? `<span class="ck-late"><i class="ph-light ph-warning"></i>Em atraso · ${daysLate(x.due)} dia${daysLate(x.due) > 1 ? 's' : ''}</span>` : ''}
        ${afterFinal(n, x) ? '<span class="ck-chip soon" title="Este prazo é depois da entrega final do processo"><i class="ph-light ph-warning"></i>Após a entrega</span>' : ''}
        ${x.due ? `<span class="ck-chip ${late ? 'late' : dl?.cls || ''}" title="${dl ? dl.txt : ''}"><i class="ph-light ph-calendar-blank"></i>${fmtDate(x.due)}</span>` : ''}
        ${x.note ? '<span class="ck-chip" title="Tem observação"><i class="ph-light ph-note"></i></span>' : ''}
        ${ph.length ? `<span class="ck-chip" title="Fotos"><i class="ph-light ph-camera"></i>${ph.length}</span>` : ''}
        ${taskDocs(n, x.id).length ? `<span class="ck-chip" title="Arquivos"><i class="ph-light ph-paperclip"></i>${taskDocs(n, x.id).length}</span>` : ''}
        ${taskLinks(n, x.id).length ? `<span class="ck-chip" title="Links"><i class="ph-light ph-link-simple"></i>${taskLinks(n, x.id).length}</span>` : ''}
        <button class="ck-owner" data-act="owner" title="Responsável: ${ownerName(x.owner)}">${whoHTML(x.owner) || '<span class="who-empty"><i class="ph-light ph-user"></i></span>'}</button>
        <button class="icon-btn ck-more" data-act="open" aria-expanded="${open}" title="Detalhes"><i class="ph-light ph-caret-down"></i></button>
        ${RO ? '' : '<button class="icon-btn ck-del" data-act="del" aria-label="Remover"><i class="ph-light ph-x"></i></button>'}
      </div>
    </div>
    <div class="ck-detail"><div class="ck-detail-in">
      <div class="ck-grid">
        <label class="ck-field wide"><span>Observação</span><textarea data-tf="note" rows="2" placeholder="Detalhes, combinados, contatos, links">${esc(x.note || '')}</textarea></label>
        <div class="ck-field"><span>Destaque</span><div class="ck-seg">${FLAGS.map(([v, l, c]) => `<button data-flag="${v}" style="--c:${c}" aria-pressed="${(x.flag || '') === v}"><i></i>${l}</button>`).join('')}</div></div>
        <div class="ck-field"><span>Responsável</span><div class="ck-seg">${owners().map(([v, l]) => `<button data-own="${v}" aria-pressed="${(x.owner || '') === v}">${l}</button>`).join('')}</div></div>
        <label class="ck-field"><span>Prazo deste subprocesso</span>${dateBtn(`due|${n.id}|${x.id}`, x.due)}${x.due && !x.done ? `<em class="ck-hint ${late ? 'late' : dl?.cls || ''}">${late ? `Atrasado ${daysLate(x.due)} dia${daysLate(x.due) > 1 ? 's' : ''}` : dl?.txt || ''}${afterFinal(n, x) ? ', depois da entrega final' : ''}</em>` : ''}</label>
        ${attachHTML(n, x)}
      </div>
    </div></div>
  </li>`;
}
function renderControl() {
  const terms = fold(S.ctrlQuery).split(/\s+/).filter(Boolean);
  const res = ctrlSearch();
  if (S.ctrlNode && !S.nodes.has(S.ctrlNode)) S.ctrlNode = '';
  const sorted = terms.length ? [...res].sort((a, b) => b.score - a.score) : res;
  S.ctrlSel = Math.min(S.ctrlSel, Math.max(0, sorted.length - 1));
  const railList = terms.length
    ? `<div class="rail-group"><h3>${sorted.length} resultado${sorted.length === 1 ? '' : 's'}</h3>${sorted.map((r, i) => railItem(r, terms, i === S.ctrlSel)).join('') || '<p class="rail-empty">Nada encontrado. Tente o nome do planeta ou de uma tarefa.</p>'}</div>`
    : planets().map(p => { const items = res.filter(r => areaOf(r.n.id).id === p.id).sort((a, b) => byOrder(a.n, b.n)); if (!items.length) return '';
        return `<div class="rail-group" style="--c:${colorOf(p.id)}"><h3><span class="sw"></span>${esc(p.title)}<span class="n">${items.length}</span></h3>${items.map(r => railItem(r, terms, false)).join('')}</div>`; }).join('') || '<p class="rail-empty">Nenhum bloco com esse filtro.</p>';
  const keepRail = ctrlEl.querySelector('.rail-list')?.scrollTop || 0;
  const keepFocus = ctrlEl.querySelector('.ctrl-focus')?.scrollTop || 0;
  const focused = document.activeElement?.id === 'ctrl-q';
  const typing = document.activeElement?.id === 'ck-input' ? document.activeElement.value : null;
  ctrlEl.innerHTML = `<div class="ctrl">
    <aside class="ctrl-rail">
      <div class="ctrl-top"><h1 class="ctrl-title">Controle<span>.</span></h1>
        <div class="ctrl-mode" role="tablist">${[['bloco', 'Blocos', 'ph-list-checks'], ['calendario', 'Calendário', 'ph-calendar-blank']].map(([v, l, ic]) => `<button role="tab" data-mode="${v}" aria-selected="${S.ctrlMode === v}"><i class="ph-light ${ic}"></i>${l}</button>`).join('')}</div></div>
      <label class="ctrl-search"><i class="ph-light ph-magnifying-glass"></i><input id="ctrl-q" value="${esc(S.ctrlQuery)}" placeholder="Buscar bloco, planeta ou tarefa" autocomplete="off" aria-label="Buscar bloco"><kbd>/</kbd></label>
      <div class="ctrl-filters">${[['todos', 'Todos'], ['pendentes', 'Com pendências'], ['atraso', 'Em atraso'], ['urgentes', 'Urgentes'], ['s1', socio(0)], ['s2', socio(1)]].map(([v, l]) => `<button data-cf="${v}" aria-pressed="${S.ctrlFilter === v}">${l}</button>`).join('')}</div>
      <div class="rail-list">${railList}</div>
    </aside>
    <section class="ctrl-focus">${S.ctrlMode === 'calendario' ? calendarHTML(res) : S.ctrlNode ? focusHTML(S.nodes.get(S.ctrlNode)) : overviewHTML()}</section>
  </div>`;
  ctrlEl.querySelector('.rail-list').scrollTop = keepRail;
  ctrlEl.querySelector('.ctrl-focus').scrollTop = keepFocus;
  if (focused) { const q = $('#ctrl-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  if (typing !== null && $('#ck-input')) { const c = $('#ck-input'); c.value = typing; c.focus({ preventScroll: true }); }
}
function railItem(r, terms, sel) {
  const { n, st, hit } = r; const pct = st.total ? st.done / st.total : 0; const col = colorOf(n.id);
  return `<button class="rail-item ${S.ctrlNode === n.id ? 'on' : ''} ${sel ? 'sel' : ''}" data-pick="${esc(n.id)}" style="--c:${col}">
    <span class="ri-top"><span class="ri-t">${mark(n.title, terms)}</span>${st.late ? `<span class="ri-late" title="${st.late} em atraso">${st.late}</span>` : ''}${st.urgent ? `<span class="ri-urg" title="${st.urgent} urgente${st.urgent > 1 ? 's' : ''}">${st.urgent}</span>` : ''}<span class="ri-n">${st.total ? `${st.done}/${st.total}` : ''}</span></span>
    ${terms.length ? `<span class="ri-sub">${mark(areaOf(n.id).title, terms)}${hit ? ` <span class="ri-hit">tarefa: ${mark(hit, terms)}</span>` : ''}</span>` : ''}
    <span class="ri-bar"><i style="--p:${pct * 100}%"></i></span></button>`;
}
function overviewHTML() {
  const list = blocks().map(n => ({ n, st: stats(n) })).filter(r => r.st.open).sort((a, b) => b.st.urgent - a.st.urgent || b.st.open - a.st.open).slice(0, 6);
  const all = blocks().reduce((a, n) => { const s = stats(n); a.t += s.total; a.d += s.done; a.u += s.urgent; a.l += s.late; return a; }, { t: 0, d: 0, u: 0, l: 0 });
  return `<div class="ov">
    <div class="ov-head"><p class="eyebrow"><i class="ph-light ph-list-checks"></i>Controle</p><h2 class="hl sm"><b>Escolha um bloco.</b> <span>E destrinche em tarefas menores.</span></h2><p>Busque à esquerda ou comece por onde tem mais coisa aberta. Cada tarefa tem responsável, destaque, observação e fotos.</p></div>
    <div class="ov-stats"><div><b>${all.t - all.d}</b><span>tarefas abertas</span></div><div><b>${all.d}</b><span>feitas</span></div><div><b class="${all.u ? 'late' : ''}">${all.u}</b><span>urgentes</span></div><div><b class="${all.l ? 'late' : ''}">${all.l}</b><span>em atraso</span></div></div>
    ${list.length ? `<h3 class="ov-sub">Com mais pendências</h3><div class="ov-grid">${list.map(({ n, st }) => `<button class="ov-card" data-pick="${esc(n.id)}" style="--c:${colorOf(n.id)}"><span class="ov-area"><span class="sw"></span>${esc(areaOf(n.id).title)}</span><b>${esc(n.title)}</b><span class="ov-meta">${st.open} aberta${st.open > 1 ? 's' : ''}${st.urgent ? `, <em>${st.urgent} urgente${st.urgent > 1 ? 's' : ''}</em>` : ''}</span><span class="ri-bar"><i style="--p:${st.done / st.total * 100}%"></i></span></button>`).join('')}</div>` : ''}
  </div>`;
}
function focusHTML(n) {
  const st = stats(n); const col = colorOf(n.id); const pct = st.total ? st.done / st.total : 0; const p = plan(n); const dl = deadline(p.fim, n.status === 'feito');
  const t = tasksOf(n);
  let shown = S.ctrlShow === 'afazer' ? t.filter(x => !x.done) : S.ctrlShow === 'feitas' ? t.filter(x => x.done) : t;
  if (S.ctrlSort === 'prazo') shown = [...shown].sort((a, b) => (a.due || '9999') .localeCompare(b.due || '9999'));
  const complete = st.total > 0 && st.open === 0;
  return `<div class="fx" style="--c:${col}">
    <header class="fx-head">
      <div class="fx-info">
        <nav class="crumbs"><button data-pick-area="${esc(areaOf(n.id).id)}"><span class="sw" style="background:${col}"></span>${esc(areaOf(n.id).title)}</button><i class="ph-light ph-caret-right"></i><span>${kindOf(n.id)}</span></nav>
        <h2>${esc(n.title)}</h2>
        <div class="fx-meta">${n.status ? `<span class="pill" style="--s:${STATUS_C[statusOf(n)]}">${esc(statusLabel(statusOf(n)))}</span>` : ''}${whoHTML(n.owner)}
          <button type="button" class="fx-due ${macroLate(n) ? 'is-late' : ''}" data-dpk="fim|${esc(n.id)}" title="Data final do processo" ${RO ? 'disabled' : ''}><i class="ph-light ph-flag-checkered"></i><span>Entrega final</span><b>${okDate(p.fim) ? fmtLong(p.fim) : 'Definir'}</b></button>
          ${p.fim ? `<span class="fx-count ${macroLate(n) ? 'late' : dl?.cls || ''}">${macroLate(n) ? `Processo em atraso · ${daysLate(p.fim)} dia${daysLate(p.fim) > 1 ? 's' : ''}` : dl?.txt || ''}</span>` : ''}
          <button class="fx-open" data-open-node="${esc(n.id)}"><i class="ph-light ph-arrow-square-out"></i>Abrir bloco</button></div>
      </div>
      <div class="fx-ring ${complete ? 'complete' : ''}">${ringSVG(pct, col)}<div class="fx-pct"><b>${Math.round(pct * 100)}%</b><span>${st.done} de ${st.total}</span></div></div>
    </header>
    ${timelineHTML(n)}
    ${complete ? `<div class="fx-done"><i class="ph-light ph-trophy"></i><span>Tudo pronto em <b>${esc(n.title)}</b>.</span>${n.status !== 'feito' && !RO ? '<button class="btn" data-mark-done>Mover para Feito no quadro</button>' : ''}</div>` : ''}
    ${RO ? '' : `<form class="ck-new" id="ck-new"><i class="ph-light ph-plus"></i><input id="ck-input" placeholder="Adicionar tarefa para ${esc(n.title)}" autocomplete="off" aria-label="Nova tarefa">
      <button type="button" class="ck-newdue ${S.newDue ? 'has' : ''}" data-dpk="new" title="Prazo da nova tarefa"><i class="ph-light ph-calendar-plus"></i><span>${S.newDue ? fmtDate(S.newDue) : 'Prazo'}</span></button>
      <button type="button" class="ck-newflag" data-newflag style="--f:${flagColor(S.newFlag)}" title="Destaque: ${(FLAGS.find(f => f[0] === S.newFlag) || FLAGS[0])[1]}"><i class="ph-light ph-flag"></i></button>
      <button type="button" class="ck-owner" data-newowner title="Responsável: ${ownerName(S.newOwner)}">${whoHTML(S.newOwner) || '<span class="who-empty"><i class="ph-light ph-user"></i></span>'}</button></form>`}
    <div class="fx-tabs">${[['afazer', 'A fazer', st.open], ['feitas', 'Feitas', st.done], ['todas', 'Todas', st.total]].map(([v, l, c]) => `<button data-show="${v}" aria-pressed="${S.ctrlShow === v}">${l}<span>${c}</span></button>`).join('')}
      <button class="fx-sort" data-sort aria-pressed="${S.ctrlSort === 'prazo'}" title="Ordenar por prazo"><i class="ph-light ph-sort-ascending"></i>${S.ctrlSort === 'prazo' ? 'Por prazo' : 'Ordem manual'}</button></div>
    <ul class="ck-list" id="ck-list">${shown.map(x => ctrlTaskRow(n, x)).join('')}</ul>
    ${!shown.length ? `<div class="ck-empty"><i class="ph-light ${st.total && S.ctrlShow === 'afazer' ? 'ph-sparkle' : 'ph-list-checks'}"></i><p>${st.total && S.ctrlShow === 'afazer' ? 'Nada pendente aqui.' : st.total ? 'Nenhuma tarefa feita ainda.' : `Destrinche ${esc(n.title)} em tarefas menores: escreva acima e dê Enter.`}</p></div>` : ''}
  </div>`;
}
// trilha do processo: hoje, cada subprocesso e a entrega final na mesma régua
function timelineHTML(n) {
  const p = plan(n); const dated = tasksOf(n).filter(x => okDate(x.due)).sort((a, b) => a.due.localeCompare(b.due));
  if (!okDate(p.fim) && !dated.length) return `<div class="tl-empty"><i class="ph-light ph-flag-checkered"></i><span>Defina a <b>entrega final</b> acima e um prazo em cada subprocesso para ver a linha do tempo.</span></div>`;
  const pts = [today(), parseDate(p.inicio), parseDate(p.fim), ...dated.map(x => parseDate(x.due))].filter(v => v != null);
  const a = Math.min(...pts), b = Math.max(...pts); const span = Math.max(b - a, DAY);
  const pos = v => ((v - a) / span) * 100;
  const late = dated.filter(isLate), after = dated.filter(x => afterFinal(n, x));
  const next = dated.find(x => !x.done && !isLate(x));
  const ok = !late.length && !after.length && !macroLate(n);
  const status = macroLate(n) ? `<b class="late">Processo em atraso</b>` : late.length ? `<b class="late">${late.length} subprocesso${late.length > 1 ? 's' : ''} em atraso</b>` : after.length ? `<b class="soon">${after.length} prazo${after.length > 1 ? 's' : ''} depois da entrega final</b>` : `<b class="ok">No ritmo</b>`;
  const left = p.fim && !macroLate(n) && n.status !== 'feito' ? Math.round((parseDate(p.fim) - today()) / DAY) : null;
  return `<section class="tl ${ok ? 'is-ok' : ''}">
    <div class="tl-top">${status}<span>${next ? `Próximo: ${esc(next.t)} até ${fmtDate(next.due)}` : dated.length ? 'Todos os subprocessos com prazo estão feitos ou atrasados' : 'Nenhum subprocesso com prazo ainda'}</span>${left != null ? `<span class="tl-left">${left === 0 ? 'Entrega hoje' : `Faltam ${left} dia${left > 1 ? 's' : ''} para a entrega`}</span>` : ''}</div>
    <div class="tl-track">
      ${p.fim ? `<span class="tl-span" style="--a:${pos(Math.min(today(), parseDate(p.fim)))}%;--b:${pos(parseDate(p.fim))}%"></span>` : ''}
      <span class="tl-today" style="--x:${pos(today())}%"><em>Hoje</em></span>
      ${p.fim ? `<span class="tl-final ${macroLate(n) ? 'late' : ''}" style="--x:${pos(parseDate(p.fim))}%" title="Entrega final ${fmtDate(p.fim)}"><i class="ph-light ph-flag-checkered"></i><em>${fmtDate(p.fim)}</em></span>` : ''}
      ${dated.map((x, i) => `<button class="tl-dot ${x.done ? 'done' : isLate(x) ? 'late' : afterFinal(n, x) ? 'after' : ''} ${x.flag === 'urgente' ? 'urg' : ''}" style="--x:${pos(parseDate(x.due))}%;--d:${i * 40}ms" data-tl="${x.id}" title="${esc(x.t)} · ${fmtDate(x.due)}${isLate(x) ? ' · em atraso' : x.done ? ' · feito' : ''}"></button>`).join('')}
    </div>
    ${dated.length ? `<div class="tl-steps">${dated.map(x => `<button class="tl-step ${x.done ? 'done' : isLate(x) ? 'late' : afterFinal(n, x) ? 'after' : ''}" data-tl="${x.id}"><span>${fmtDate(x.due)}</span><b>${esc(x.t)}</b></button>`).join('')}${p.fim ? `<span class="tl-step final ${macroLate(n) ? 'late' : ''}"><span>${fmtDate(p.fim)}</span><b>Entrega final</b></span>` : ''}</div>` : ''}
  </section>`;
}
/* ---------- um só calendário ---------- */
// prazos do sistema inteiro por dia: entregas finais (sol, planetas, estrelas, satélites), subprocessos e anotações do dia.
// O calendário do Controle e o seletor de data de qualquer aba leem daqui, então tudo mostra a mesma coisa.
function dayEvents(nodes, notes = true) {
  const ev = {};
  const push = (k, e) => (ev[k] = ev[k] || []).push(e);
  for (const n of nodes) {
    const p = plan(n);
    if (okDate(p.fim)) push(p.fim, { kind: 'final', n, late: macroLate(n), done: n.status === 'feito', t: n.title });
    for (const x of tasksOf(n)) if (okDate(x.due)) push(x.due, { kind: 'sub', n, x, late: isLate(x), done: x.done, t: x.t, urg: x.flag === 'urgente' });
  }
  if (notes) for (const [k, list] of S.days) for (const x of list) {
    const n = x.node && S.nodes.get(x.node);
    if (n && !nodes.includes(n)) continue;
    push(k, { kind: 'nota', n: n || null, note: x, done: x.done, t: x.t, late: false });
  }
  for (const k in ev) ev[k].sort((a, b) => (b.kind === 'final') - (a.kind === 'final') || a.done - b.done);
  return ev;
}
// o que entra no calendário do Controle: os blocos do filtro e, sem filtro, também o sol e os planetas
function calNodes(res) {
  if (S.calOnly && S.ctrlNode && S.nodes.has(S.ctrlNode)) return [S.nodes.get(S.ctrlNode)];
  const list = res.map(r => r.n);
  return !S.ctrlQuery && S.ctrlFilter === 'todos' ? [...[...S.nodes.values()].filter(n => depth(n.id) < 2), ...list] : list;
}
const evColor = e => e.n ? colorOf(e.n.id) : 'var(--gray)';
const evTitle = e => e.kind === 'nota' ? `Anotação${e.n ? ' · ' + e.n.title : ''}` : e.kind === 'final' ? `${e.n.title} · entrega final` : `${e.n.title} · ${e.x.t}`;
const weekLabel = k => { const s = new Date(parseDate(k)).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.replace(/^./, c => c.toUpperCase()); };
// todos os corpos para escolher a que o prazo se refere, agrupados por planeta
function refOptions(sel) {
  const r = root(); const opt = (n, pre = '') => `<option value="${esc(n.id)}" ${sel === n.id ? 'selected' : ''}>${pre}${esc(n.title)}</option>`;
  return `<option value="" ${!sel ? 'selected' : ''}>Nenhum: só uma anotação do dia</option>${r ? `<optgroup label="Sol">${opt(r)}</optgroup>` : ''}${planets().map(p => `<optgroup label="${esc(p.title)}">${opt(p, 'Planeta: ')}${descendants(p.id).map(k => opt(k, depth(k.id) === 2 ? '' : '  ↳ ')).join('')}</optgroup>`).join('')}`;
}

// calendário mensal do Controle: cada dia abre um painel para ver, anotar e marcar prazos
function calendarHTML(res) {
  const m = S.calMonth || ymd().slice(0, 7);
  const [Y, M] = m.split('-').map(Number);
  const first = new Date(Y, M - 1, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const src = calNodes(res);
  const ev = dayEvents(src);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const label = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthEv = Object.entries(ev).filter(([k]) => k.startsWith(m)).flatMap(([, v]) => v);
  const lateAll = src.flatMap(n => [...tasksOf(n).filter(isLate).map(x => ({ n, x })), ...(macroLate(n) ? [{ n, x: null }] : [])]);
  return `<div class="cal ${S.calDay ? 'with-day' : ''}">
    <header class="cal-head">
      <div><p class="eyebrow"><i class="ph-light ph-calendar-blank"></i>Calendário</p><h2 class="hl sm"><b>${esc(label.split(' de ')[0].replace(/^./, c => c.toUpperCase()))}</b> <span>${esc(label.split(' de ').slice(1).join(' de '))}</span></h2><p>${monthEv.length} ${monthEv.length === 1 ? 'item' : 'itens'} neste mês${lateAll.length ? `, <span class="late">${lateAll.length} em atraso no total</span>` : ''}. ${RO ? '' : 'Clique num dia para anotar ou marcar um prazo.'}</p></div>
      <div class="cal-nav">${S.ctrlNode ? `<button class="cal-only" data-calonly aria-pressed="${S.calOnly}">${S.calOnly ? 'Só ' + esc(S.nodes.get(S.ctrlNode).title) : 'Todos os blocos'}</button>` : ''}
        <button class="icon-btn" data-cal="-1" title="Mês anterior"><i class="ph-light ph-caret-left"></i></button><button class="today-btn" data-cal="0" ${m === ymd().slice(0, 7) ? 'aria-pressed="true"' : ''}>Hoje</button><button class="icon-btn" data-cal="1" title="Próximo mês"><i class="ph-light ph-caret-right"></i></button></div>
    </header>
    <div class="cal-legend"><span><i class="lg final"></i>Entrega final</span><span><i class="lg sub"></i>Subprocesso</span><span><i class="lg nota"></i>Anotação</span><span><i class="lg late"></i>Em atraso</span><span><i class="lg done"></i>Feito</span></div>
    <div class="cal-body">
    <div class="cal-grid">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<span class="cal-wd">${d}</span>`).join('')}
      ${cells.map(d => { const k = ymd(d); const list = ev[k] || []; const out = d.getMonth() !== M - 1;
        return `<div class="cal-day ${out ? 'out' : ''} ${k === ymd() ? 'is-today' : ''} ${k === S.calDay ? 'is-sel' : ''} ${list.some(e => e.late) ? 'has-late' : ''}" data-day="${k}" role="button" tabindex="0" aria-label="${esc(weekLabel(k))}: ${list.length} ${list.length === 1 ? 'item' : 'itens'}"><span class="cal-n">${d.getDate()}</span>
          ${list.slice(0, 3).map(e => `<button class="cal-ev ${e.kind} ${e.late ? 'late' : ''} ${e.done ? 'done' : ''} ${e.urg ? 'urg' : ''}" style="--c:${evColor(e)}" ${e.kind === 'nota' ? `data-day-open="${k}"` : `data-ev-node="${esc(e.n.id)}" ${e.x ? `data-ev-task="${e.x.id}"` : ''}`} title="${esc(evTitle(e))}${e.late ? ' · em atraso' : ''}">${e.kind === 'final' ? '<i class="ph-light ph-flag-checkered"></i>' : e.kind === 'nota' ? '<i class="ph-light ph-note-pencil"></i>' : ''}<span>${esc(e.t)}</span></button>`).join('')}
          ${list.length > 3 ? `<button class="cal-more" data-day-open="${k}">+${list.length - 3}</button>` : ''}</div>`; }).join('')}
    </div>
    ${S.calDay ? dayPanelHTML(S.calDay, ev[S.calDay] || []) : ''}
    </div>
    ${lateAll.length ? `<section class="cal-late"><h3><i class="ph-light ph-warning"></i>Em atraso</h3>${lateAll.map(({ n, x }) => `<button class="cal-late-row" style="--c:${colorOf(n.id)}" data-ev-node="${esc(n.id)}" ${x ? `data-ev-task="${x.id}"` : ''}><span class="sw"></span><b>${esc(x ? x.t : 'Entrega final de ' + n.title)}</b><small>${esc(n.title)}</small><em>${fmtDate(x ? x.due : plan(n).fim)} · ${daysLate(x ? x.due : plan(n).fim)} dia${daysLate(x ? x.due : plan(n).fim) > 1 ? 's' : ''}</em></button>`).join('')}</section>` : ''}
  </div>`;
}
// painel do dia: tudo o que cai nele e um campo para escrever e escolher a que estrela, satélite ou planeta se refere
function dayPanelHTML(k, list) {
  const ref = S.calRef && S.nodes.get(S.calRef);
  const kind = ref ? S.calKind : 'nota';
  const curFim = ref && okDate(plan(ref).fim) ? plan(ref).fim : '';
  const row = e => {
    const sub = e.kind === 'final' ? 'Entrega final' : e.kind === 'sub' ? `Subprocesso de ${e.n.title}` : e.n ? `Anotação · ${e.n.title}` : 'Anotação do dia';
    const key = e.kind === 'final' ? `fim|${e.n.id}` : e.kind === 'sub' ? `due|${e.n.id}|${e.x.id}` : `nota|${e.note.id}`;
    return `<li class="dp-row ${e.kind} ${e.done ? 'done' : ''} ${e.late ? 'late' : ''}" style="--c:${evColor(e)}">
      ${e.kind === 'final' ? '<span class="dp-ic"><i class="ph-light ph-flag-checkered"></i></span>' : `<button class="ck-box sm" data-day-toggle="${esc(key)}" role="checkbox" aria-checked="${!!e.done}" aria-label="Marcar como feito" ${RO ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>`}
      <div class="dp-txt"><b>${esc(e.kind === 'final' ? e.n.title : e.t)}</b><small><span class="sw"></span>${esc(sub)}${e.late ? ' · em atraso' : ''}</small></div>
      ${e.n ? `<button class="icon-btn" ${e.kind === 'nota' ? `data-ev-node="${esc(e.n.id)}"` : `data-ev-node="${esc(e.n.id)}" ${e.x ? `data-ev-task="${e.x.id}"` : ''}`} title="Abrir ${esc(e.n.title)}"><i class="ph-light ph-arrow-square-out"></i></button>` : ''}
      ${RO ? '' : `<button class="icon-btn" data-dpk="${esc(key)}" title="Mudar a data"><i class="ph-light ph-calendar-dots"></i></button>
      <button class="icon-btn" data-day-del="${esc(key)}" title="${e.kind === 'nota' ? 'Apagar anotação' : 'Tirar deste dia'}"><i class="ph-light ph-x"></i></button>`}</li>`;
  };
  return `<aside class="cal-dayp" aria-label="${esc(weekLabel(k))}">
    <header><div><p class="eyebrow">${list.length} ${list.length === 1 ? 'item' : 'itens'}</p><h3>${esc(weekLabel(k))}</h3></div><button class="icon-btn" data-day-close title="Fechar (Esc)"><i class="ph-light ph-x"></i></button></header>
    ${list.length ? `<ul class="dp-list">${list.map(row).join('')}</ul>` : '<p class="dp-empty">Nada marcado neste dia ainda.</p>'}
    ${RO ? '' : `<form class="dp-form" id="day-form">
      <label class="dp-f"><span>${kind === 'final' ? 'Observação (opcional)' : 'Escreva o que quiser'}</span><textarea id="day-text" rows="2" placeholder="${kind === 'final' ? 'Fica como anotação junto da entrega' : 'Ex.: aprovar a proposta com o fornecedor'}">${esc(S.calText)}</textarea></label>
      <label class="dp-f"><span>Referente a</span><span class="select" style="--c:${ref ? colorOf(ref.id) : 'var(--gray)'}"><span class="sw"></span><select id="day-ref">${refOptions(S.calRef)}</select><i class="ph-light ph-caret-down"></i></span></label>
      ${ref ? `<div class="dp-f"><span>Como entra</span><div class="ck-seg">
        <button type="button" data-day-kind="tarefa" aria-pressed="${kind === 'tarefa'}">Tarefa com prazo neste dia</button>
        <button type="button" data-day-kind="final" aria-pressed="${kind === 'final'}">Entrega final</button>
        <button type="button" data-day-kind="nota" aria-pressed="${kind === 'nota'}">Só anotação</button></div>
        <em class="dp-hint">${kind === 'final' ? (curFim && curFim !== k ? `A entrega final de ${esc(ref.title)} está em ${fmtLong(curFim)} e passa para este dia.` : curFim === k ? `Este já é o dia da entrega final de ${esc(ref.title)}.` : `Vira a data de entrega de ${esc(ref.title)} em todas as abas.`) : kind === 'tarefa' ? `Entra no checklist de ${esc(ref.title)} com este prazo.` : `Fica anotado neste dia, ligado a ${esc(ref.title)}.`}</em></div>` : ''}
      <button class="btn" type="submit"><i class="ph-light ph-plus"></i>${kind === 'final' ? 'Marcar entrega final' : kind === 'tarefa' ? 'Adicionar tarefa' : 'Anotar'}</button>
    </form>`}
  </aside>`;
}
function pickBlock(id) {
  if (S.ctrlNode !== id) { S.ctrlOpen = ''; S.ctrlShow = stats(S.nodes.get(id)).open || !stats(S.nodes.get(id)).total ? 'afazer' : 'todas'; }
  S.ctrlNode = id; S.ctrlMode = 'bloco'; renderControl();
  ctrlEl.querySelector('.ctrl-focus')?.scrollTo({ top: 0 });
  if (!RO) $('#ck-input')?.focus({ preventScroll: true });
}
const curNode = () => S.nodes.get(S.ctrlNode);
const setTasks = (list, now = true) => now ? saveNow(S.ctrlNode, { checklist: list }) : queue(S.ctrlNode, 'checklist', list, 500);
function afterTasks() { refreshNodeObject(S.ctrlNode); renderControl(); if (S.open === S.ctrlNode) renderDrawer(); }

ctrlEl.addEventListener('input', e => {
  if (e.target.id === 'ctrl-q') { S.ctrlQuery = e.target.value; S.ctrlSel = 0; renderControl(); return; }
  const li = e.target.closest('.ck'); if (!li || RO) return;
  const n = curNode(); const tid = li.dataset.tid;
  if (e.target.classList.contains('ck-t')) setTasks(tasksOf(n).map(x => x.id === tid ? { ...x, t: e.target.value } : x), false);
  if (e.target.dataset.tf === 'note') setTasks(tasksOf(n).map(x => x.id === tid ? { ...x, note: e.target.value } : x), false);
});
ctrlEl.addEventListener('change', async e => {
  const li = e.target.closest('.ck'); if (!li || RO) return;
  const n = curNode(); const tid = li.dataset.tid;
  if (e.target.dataset.tf === 'note') flushAll();
  if (e.target.matches('[data-photo], [data-file]')) uploadToTask(n, tid, [...e.target.files]);
});
ctrlEl.addEventListener('keydown', e => {
  if (e.target.id === 'ctrl-q') {
    const items = [...ctrlEl.querySelectorAll('.rail-item')];
    if (e.key === 'ArrowDown' && S.ctrlQuery) { e.preventDefault(); S.ctrlSel = Math.min(items.length - 1, S.ctrlSel + 1); renderControl(); }
    if (e.key === 'ArrowUp' && S.ctrlQuery) { e.preventDefault(); S.ctrlSel = Math.max(0, S.ctrlSel - 1); renderControl(); }
    if (e.key === 'Enter') { e.preventDefault(); const it = S.ctrlQuery ? items[S.ctrlSel] : items[0]; if (it) pickBlock(it.dataset.pick); }
    if (e.key === 'Escape' && S.ctrlQuery) { e.stopPropagation(); S.ctrlQuery = ''; renderControl(); }
    return;
  }
  const li = e.target.closest('.ck'); if (!li || !e.target.classList.contains('ck-t')) return;
  if (e.key === 'Enter') { e.preventDefault(); flushAll(); $('#ck-input')?.focus(); }
  if (e.key === 'Backspace' && !e.target.value && !RO) { e.preventDefault(); setTasks(tasksOf(curNode()).filter(x => x.id !== li.dataset.tid)).then(() => { afterTasks(); $('#ck-input')?.focus(); }); }
});
ctrlEl.addEventListener('submit', async e => {
  if (e.target.matches('[data-linkform]')) {
    e.preventDefault();
    const n = curNode(); const tid = e.target.closest('.ck')?.dataset.tid; if (!n || !tid || RO) return;
    const fd = new FormData(e.target); let url = String(fd.get('url') || '').trim(); const t = String(fd.get('t') || '').trim();
    if (!url) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { toast('Esse endereço não parece um link'); return; }
    S.ctrlLink = '';
    await saveNow(n.id, { links: [...(n.links || []), { id: uid(), url, t, at: Date.now(), task: tid }] });
    toast(`Link anexado em "${taskName(n, tid)}"`);
    return afterTasks();
  }
  if (e.target.id !== 'ck-new') return; e.preventDefault();
  const inp = $('#ck-input'); const v = inp.value.trim(); if (!v) return;
  inp.value = ''; // limpa já, para a próxima tarefa poder ser digitada sem esperar o salvamento
  const n = curNode();
  const saving = setTasks([...tasksOf(n), { id: uid(), t: v, done: false, owner: S.newOwner, flag: S.newFlag, due: S.newDue, at: Date.now() }]);
  if (S.ctrlShow === 'feitas') S.ctrlShow = 'afazer';
  afterTasks();
  ctrlEl.querySelector('.ck-list > li:last-child')?.classList.add('enter');
  await saving;
});
ctrlEl.addEventListener('click', async e => {
  const pick = e.target.closest('[data-pick]'); if (pick) return pickBlock(pick.dataset.pick);
  const cf = e.target.closest('[data-cf]'); if (cf) { S.ctrlFilter = cf.dataset.cf; return renderControl(); }
  const md = e.target.closest('[data-mode]'); if (md) { S.ctrlMode = md.dataset.mode; return renderControl(); }
  const cn = e.target.closest('[data-cal]'); if (cn) { const d = +cn.dataset.cal; if (!d) S.calMonth = ymd().slice(0, 7); else { const [y, mm] = (S.calMonth || ymd().slice(0, 7)).split('-').map(Number); const x = new Date(y, mm - 1 + d, 1); S.calMonth = ymd(x).slice(0, 7); } return renderControl(); }
  if (e.target.closest('[data-calonly]')) { S.calOnly = !S.calOnly; return renderControl(); }
  const evb = e.target.closest('[data-ev-node]');
  if (evb) { const id = evb.dataset.evNode, tid = evb.dataset.evTask; if (depth(id) < 2) return openNode(id, false); pickBlock(id); if (tid) { S.ctrlShow = 'todas'; S.ctrlOpen = tid; renderControl(); ctrlEl.querySelector(`.ck[data-tid="${tid}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
  const tl = e.target.closest('[data-tl]'); if (tl) { S.ctrlShow = 'todas'; S.ctrlOpen = tl.dataset.tl; renderControl(); ctrlEl.querySelector(`.ck[data-tid="${tl.dataset.tl}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (e.target.closest('[data-sort]')) { S.ctrlSort = S.ctrlSort === 'prazo' ? 'manual' : 'prazo'; return renderControl(); }
  const pa = e.target.closest('[data-pick-area]'); if (pa) { S.ctrlQuery = S.nodes.get(pa.dataset.pickArea).title; S.ctrlNode = ''; return renderControl(); }
  const on = e.target.closest('[data-open-node]'); if (on) return openNode(on.dataset.openNode, false);
  const sh = e.target.closest('[data-show]'); if (sh) { S.ctrlShow = sh.dataset.show; return renderControl(); }
  if (e.target.closest('[data-newowner]')) { S.newOwner = ownerCycle(S.newOwner); renderControl(); return $('#ck-input')?.focus(); }
  if (e.target.closest('[data-newflag]')) { S.newFlag = { '': 'atencao', atencao: 'urgente', urgente: '' }[S.newFlag]; renderControl(); return $('#ck-input')?.focus(); }
  if (e.target.closest('[data-mark-done]')) { await saveNow(S.ctrlNode, { status: 'feito' }); toast(`"${curNode().title}" foi para Feito no quadro`); return afterTasks(); }
  const lb = e.target.closest('[data-lb]'); if (lb) return lightbox(lb.dataset.lb);
  const li = e.target.closest('.ck'); if (!li) return;
  const n = curNode(); const tid = li.dataset.tid; const x = tasksOf(n).find(y => y.id === tid);
  if (e.target.closest('[data-act="open"]') || (e.target.closest('.ck-row') && !e.target.closest('button, input'))) { S.ctrlOpen = S.ctrlOpen === tid ? '' : tid; return renderControl(); }
  if (RO) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'toggle') {
    const done = !x.done;
    li.classList.toggle('done', done); li.querySelector('.ck-box').setAttribute('aria-checked', done);
    await setTasks(tasksOf(n).map(y => y.id === tid ? { ...y, done, doneAt: done ? Date.now() : null } : y));
    // deixa a marcação aparecer antes de a tarefa mudar de lista
    setTimeout(() => { if (done && S.ctrlShow === 'afazer') { li.classList.add('leave'); setTimeout(afterTasks, 380); } else afterTasks(); }, done ? 420 : 0);
    if (done && stats(curNode()).open === 0) toast(`Tudo pronto em "${n.title}"`);
    return;
  }
  if (act === 'owner') { await setTasks(tasksOf(n).map(y => y.id === tid ? { ...y, owner: ownerCycle(y.owner) } : y)); return afterTasks(); }
  if (act === 'del') { li.classList.add('leave'); await setTasks(tasksOf(n).filter(y => y.id !== tid)); return setTimeout(afterTasks, 300); }
  const fl = e.target.closest('[data-flag]'); if (fl) { await setTasks(tasksOf(n).map(y => y.id === tid ? { ...y, flag: fl.dataset.flag } : y)); return afterTasks(); }
  const ow = e.target.closest('[data-own]'); if (ow) { await setTasks(tasksOf(n).map(y => y.id === tid ? { ...y, owner: ow.dataset.own } : y)); return afterTasks(); }
  if (e.target.closest('[data-addlink]')) { S.ctrlLink = S.ctrlLink === tid ? '' : tid; renderControl(); return ctrlEl.querySelector('[data-linkform] input')?.focus(); }
  const dl = e.target.closest('[data-dellink]');
  if (dl) { await saveNow(n.id, { links: (n.links || []).filter(l => l.id !== dl.dataset.dellink) }); return afterTasks(); }
  const dp = e.target.closest('[data-delph]');
  if (dp) { try { const fresh = await api.removeFile(n.id, dp.dataset.delph); recentSelf.set(n.id, Date.now()); adopt(n.id, fresh); afterTasks(); } catch (er) { toast('Não removeu: ' + er.message); } }
});
// colar uma imagem com uma tarefa aberta anexa a foto nela
ctrlEl.addEventListener('paste', async e => {
  if (RO || !S.ctrlOpen || !S.ctrlNode) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (!f) return;
  e.preventDefault();
  uploadToTask(curNode(), S.ctrlOpen, [new File([f], `colado-${Date.now()}.png`, { type: f.type })]);
});
// soltar arquivos num subprocesso aberto anexa nele
ctrlEl.addEventListener('dragover', e => {
  const li = e.target.closest('.ck.open'); if (RO || !li || !e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault(); ctrlEl.querySelectorAll('.ck.drop-files').forEach(c => c !== li && c.classList.remove('drop-files')); li.classList.add('drop-files');
});
ctrlEl.addEventListener('dragleave', e => { const li = e.target.closest('.ck.drop-files'); if (li && !li.contains(e.relatedTarget)) li.classList.remove('drop-files'); });
ctrlEl.addEventListener('drop', e => {
  const li = e.target.closest('.ck.open'); if (RO || !li || !e.dataTransfer?.files?.length) return;
  e.preventDefault(); li.classList.remove('drop-files');
  uploadToTask(curNode(), li.dataset.tid, [...e.dataTransfer.files]);
});
// reordenar tarefas arrastando pela alça
let ckDrag = null;
ctrlEl.addEventListener('pointerdown', e => {
  const grip = e.target.closest('.ck-grip'); if (!grip || RO) return;
  const li = grip.closest('.ck'); e.preventDefault();
  ckDrag = { li, id: li.dataset.tid, y: e.clientY, list: li.parentElement };
  li.classList.add('dragging'); document.body.classList.add('board-dragging');
});
addEventListener('pointermove', e => {
  if (!ckDrag) return;
  ckDrag.li.style.transform = `translateY(${e.clientY - ckDrag.y}px)`;
  const sibs = [...ckDrag.list.children].filter(c => c !== ckDrag.li);
  sibs.forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const tgt = sibs.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.bottom && e.clientY > r.top; });
  if (tgt) { const r = tgt.getBoundingClientRect(); tgt.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); }
  ckDrag.target = tgt; ckDrag.before = tgt ? e.clientY < tgt.getBoundingClientRect().top + tgt.getBoundingClientRect().height / 2 : null;
});
addEventListener('pointerup', async () => {
  if (!ckDrag) return;
  const d = ckDrag; ckDrag = null; document.body.classList.remove('board-dragging');
  if (!d.target) { d.li.style.transform = ''; d.li.classList.remove('dragging'); return; }
  const list = tasksOf(curNode()).filter(x => x.id !== d.id); const moving = tasksOf(curNode()).find(x => x.id === d.id);
  let i = list.findIndex(x => x.id === d.target.dataset.tid); if (!d.before) i++;
  list.splice(i, 0, moving);
  await setTasks(list); afterTasks();
});

/* ---------- seletor de data ---------- */
// todo campo de data abre este mesmo calendário, com os prazos do sistema marcados em cada dia.
// A data só é gravada quando está completa (dia, mês e ano de 4 dígitos), então nada salva pela metade.
const dateBtn = (key, v) => `<button type="button" class="dpk ${okDate(v) ? 'has' : ''}" data-dpk="${esc(key)}" ${RO ? 'disabled' : ''}><i class="ph-light ph-calendar-blank"></i><span>${okDate(v) ? fmtLong(v) : 'Escolher data'}</span><i class="ph-light ph-caret-down dpk-c"></i></button>`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const brDate = s => okDate(s) ? s.split('-').reverse().join('/') : '';
const dp = document.createElement('div'); dp.className = 'dp'; dp.hidden = true; dp.setAttribute('role', 'dialog'); document.body.appendChild(dp);
let dpKey = '', dpMonth = '', dpAnchor = null, dpRect = null;

function findNote(nid) { for (const [k, l] of S.days) { const x = l.find(y => y.id === nid); if (x) return [k, x]; } return []; }
function dateGet(key) {
  const [k, id, tid] = key.split('|');
  if (k === 'new') return S.newDue;
  if (k === 'nota') return findNote(id)[0] || '';
  const n = S.nodes.get(id); if (!n) return '';
  return (k === 'due' ? tasksOf(n).find(x => x.id === tid)?.due : plan(n)[k]) || '';
}
function dateWhat(key) {
  const [k, id, tid] = key.split('|'); const n = S.nodes.get(id);
  if (k === 'new') return ['Prazo da nova tarefa', curNode()?.title || ''];
  if (k === 'nota') return ['Anotação', findNote(id)[1]?.t || ''];
  if (!n) return ['Data', ''];
  if (k === 'due') return ['Prazo do subprocesso', tasksOf(n).find(x => x.id === tid)?.t || n.title];
  return [k === 'fim' ? 'Entrega final' : 'Começa', n.title];
}
async function dateSet(key, v) {
  const [k, id, tid] = key.split('|');
  if (k === 'new') { S.newDue = v; renderControl(); return $('#ck-input')?.focus(); }
  if (RO) return;
  if (k === 'nota') return moveNote(id, v);
  const n = S.nodes.get(id); if (!n) return;
  await flushAll();
  if (k === 'due') await saveNow(id, { checklist: tasksOf(S.nodes.get(id)).map(x => x.id === tid ? { ...x, due: v } : x) });
  else await saveNow(id, { plan: { ...plan(S.nodes.get(id)), [k]: v } });
  if (k === 'fim') toast(v ? `Entrega de "${n.title}" em ${fmtLong(v)}: já vale no Sistema, no Quadro e no Controle` : `"${n.title}" ficou sem data de entrega`);
  syncViews(id);
}
// depois de mudar uma data: redesenha o que estiver aberto (painel do Sistema, Quadro, Controle, Índice) com o mesmo dado
function syncViews(id) {
  if (id && objs.has(id)) refreshNodeObject(id);
  if (S.open && S.nodes.has(S.open)) { const sc = $('#d-scroll')?.scrollTop; renderDrawer(); if ($('#d-scroll')) $('#d-scroll').scrollTop = sc; }
  if (S.view === 'controle') renderControl(); else renderOtherViews();
  if (!dp.hidden) renderDp();
}

// anotações do dia (tabela "dias"): texto livre, ligado ou não a um corpo do sistema
async function saveDayNotes(k, list) {
  if (list.length) S.days.set(k, list); else S.days.delete(k);
  try { await api.saveDay(k, list); return true; } catch (e) { toast('Não salvou a anotação: ' + e.message); return false; }
}
async function moveNote(nid, v) {
  const [k, x] = findNote(nid); if (!x || !okDate(v) || k === v) return;
  await Promise.all([saveDayNotes(k, S.days.get(k).filter(y => y.id !== nid)), saveDayNotes(v, [...(S.days.get(v) || []), x])]);
  syncViews();
}
async function loadDays() {
  try { const list = await api.days(); S.days = new Map(list.filter(d => okDate(d.date) && d.tasks?.length).map(d => [d.date, d.tasks])); } catch { return; }
  if (S.view === 'controle' && !(ctrlEl.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderControl();
  if (!dp.hidden) renderDp();
}

function openDp(key, anchor) {
  dpKey = key; dpAnchor = anchor; dpRect = anchor.getBoundingClientRect();
  const v = dateGet(key); dpMonth = (okDate(v) ? v : ymd()).slice(0, 7);
  renderDp(); dp.hidden = false; placeDp();
  const t = dp.querySelector('#dp-type'); t.focus(); t.select();
}
function closeDp() { dp.hidden = true; dpKey = ''; if (dpAnchor?.isConnected) dpAnchor.focus({ preventScroll: true }); dpAnchor = null; }
function placeDp() {
  const r = dpAnchor?.isConnected ? dpAnchor.getBoundingClientRect() : dpRect; if (!r) return;
  const w = dp.offsetWidth, h = dp.offsetHeight;
  // abaixo do campo; sem espaço, acima; sem espaço nos dois, ao lado, para não cobrir o campo
  let top = r.bottom + 6, left = r.left;
  if (top + h > innerHeight - 8) {
    if (r.top - h - 6 >= 8) top = r.top - h - 6;
    else { top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8)); left = r.left - w - 8 >= 8 ? r.left - w - 8 : r.right + 8; }
  }
  dp.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px'; dp.style.top = top + 'px';
}
function renderDp(msg = '') {
  const v = dateGet(dpKey); const [Y, M] = dpMonth.split('-').map(Number);
  const first = new Date(Y, M - 1, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const ev = dayEvents([...S.nodes.values()]);
  const yNow = new Date().getFullYear(); const years = new Set(Array.from({ length: 16 }, (_, i) => yNow - 3 + i)); years.add(Y);
  const [what, who] = dateWhat(dpKey);
  const typed = dp.querySelector('#dp-type')?.value;
  dp.innerHTML = `<div class="dp-head"><span>${esc(what)}</span>${who ? `<b>${esc(who)}</b>` : ''}</div>
    <label class="dp-type"><i class="ph-light ph-keyboard"></i><input id="dp-type" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="dd/mm/aaaa" value="${esc(typed ?? brDate(v))}" aria-label="Digite a data"><em class="${msg ? 'err' : ''}">${esc(msg || 'ou escolha abaixo')}</em></label>
    <div class="dp-nav"><button type="button" class="icon-btn" data-dpm="-1" title="Mês anterior"><i class="ph-light ph-caret-left"></i></button>
      <span class="select"><select id="dp-m" aria-label="Mês">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === M ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select></span>
      <span class="select"><select id="dp-y" aria-label="Ano">${[...years].sort().map(y => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select></span>
      <button type="button" class="icon-btn" data-dpm="1" title="Próximo mês"><i class="ph-light ph-caret-right"></i></button></div>
    <div class="dp-grid">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(d => `<span class="dp-wd">${d}</span>`).join('')}
      ${cells.map(d => { const k = ymd(d); const list = ev[k] || [];
        return `<button type="button" class="dp-d ${d.getMonth() !== M - 1 ? 'out' : ''} ${k === ymd() ? 'today' : ''} ${k === v ? 'sel' : ''}" data-dp-day="${k}" title="${esc(list.length ? list.map(evTitle).join('\n') : weekLabel(k))}">${d.getDate()}${list.length ? `<span class="dp-dots">${list.slice(0, 3).map(e => `<i style="--c:${e.late ? 'var(--red)' : evColor(e)}"></i>`).join('')}</span>` : ''}</button>`; }).join('')}</div>
    <div class="dp-foot"><button type="button" data-dp-day="${ymd()}">Hoje</button>${v && !dpKey.startsWith('nota') ? '<button type="button" data-dp-clear>Sem data</button>' : ''}<span class="grow"></span>${RO || dpKey === 'new' ? '' : `<button type="button" data-dp-cal>Ver no calendário<i class="ph-light ph-arrow-right"></i></button>`}</div>`;
}
const dpGo = d => { const [y, m] = dpMonth.split('-').map(Number); dpMonth = ymd(new Date(y, m - 1 + d, 1)).slice(0, 7); renderDp(); };
async function commitDp(v) { const key = dpKey; closeDp(); await dateSet(key, v); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-dpk]'); if (!b || b.disabled) return;
  e.preventDefault();
  if (!dp.hidden && dpKey === b.dataset.dpk) return closeDp();
  openDp(b.dataset.dpk, b);
});
document.addEventListener('pointerdown', e => { if (!dp.hidden && !dp.contains(e.target) && !e.target.closest('[data-dpk]')) closeDp(); }, true);
addEventListener('resize', () => { if (!dp.hidden) placeDp(); });
dp.addEventListener('click', e => {
  const m = e.target.closest('[data-dpm]'); if (m) return dpGo(+m.dataset.dpm);
  const d = e.target.closest('[data-dp-day]'); if (d) return commitDp(d.dataset.dpDay);
  if (e.target.closest('[data-dp-clear]')) return commitDp('');
  if (e.target.closest('[data-dp-cal]')) {
    const v = dateGet(dpKey); closeDp();
    if (S.open) closeDrawer();
    S.ctrlMode = 'calendario'; S.calMonth = (okDate(v) ? v : ymd()).slice(0, 7); S.calDay = okDate(v) ? v : '';
    setView('controle');
  }
});
dp.addEventListener('change', e => {
  if (e.target.id === 'dp-m' || e.target.id === 'dp-y') { dpMonth = `${dp.querySelector('#dp-y').value}-${String(dp.querySelector('#dp-m').value).padStart(2, '0')}`; renderDp(); }
});
// digitar: só números, as barras entram sozinhas; com 8 dígitos válidos a data é gravada
dp.addEventListener('input', e => {
  if (e.target.id !== 'dp-type') return;
  const dg = e.target.value.replace(/\D/g, '').slice(0, 8);
  e.target.value = [dg.slice(0, 2), dg.slice(2, 4), dg.slice(4)].filter(Boolean).join('/');
  const em = dp.querySelector('.dp-type em');
  if (dg.length < 8) { em.className = ''; em.textContent = dg.length > 4 ? 'continue: o ano tem 4 dígitos' : 'ou escolha abaixo'; return; }
  const v = `${dg.slice(4)}-${dg.slice(2, 4)}-${dg.slice(0, 2)}`;
  if (!okDate(v)) { em.className = 'err'; em.textContent = +dg.slice(4) < 1900 ? 'Ano inválido' : 'Essa data não existe'; return; }
  commitDp(v);
});
dp.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDp(); }
  if (e.key === 'Enter' && e.target.id === 'dp-type') { e.preventDefault(); const dg = e.target.value.replace(/\D/g, ''); if (!dg) { if (dateGet(dpKey) && !dpKey.startsWith('nota')) commitDp(''); else closeDp(); } else renderDp('Complete dia, mês e ano: dd/mm/aaaa'); }
});

/* ---------- painel do dia no calendário ---------- */
function openDay(k) { S.calDay = k; S.calMonth = k.slice(0, 7); renderControl(); if (!RO) $('#day-text')?.focus({ preventScroll: true }); }
async function dayToggle(key) {
  const [k, id, tid] = key.split('|');
  if (k === 'nota') { const [d] = findNote(id); if (d) await saveDayNotes(d, S.days.get(d).map(x => x.id === id ? { ...x, done: !x.done, doneAt: x.done ? null : Date.now() } : x)); return syncViews(); }
  const n = S.nodes.get(id); if (!n) return;
  await saveNow(id, { checklist: tasksOf(n).map(x => x.id === tid ? { ...x, done: !x.done, doneAt: x.done ? null : Date.now() } : x) });
  syncViews(id);
}
async function dayDel(key) {
  const [k, id] = key.split('|');
  if (k === 'nota') { const [d] = findNote(id); if (d) await saveDayNotes(d, S.days.get(d).filter(x => x.id !== id)); return syncViews(); }
  await dateSet(key, '');
}
async function daySubmit() {
  const k = S.calDay; const t = ($('#day-text')?.value || '').trim(); const ref = S.calRef && S.nodes.get(S.calRef);
  const kind = ref ? S.calKind : 'nota';
  if (kind !== 'final' && !t) { toast('Escreva alguma coisa para anotar neste dia'); return $('#day-text')?.focus(); }
  S.calText = '';
  if (kind === 'final') {
    await flushAll(); await saveNow(ref.id, { plan: { ...plan(ref), fim: k } });
    if (t) await saveDayNotes(k, [...(S.days.get(k) || []), { id: uid(), t, done: false, node: ref.id, owner: '', at: Date.now() }]);
    toast(`Entrega de "${ref.title}" em ${fmtLong(k)}: já vale no Sistema, no Quadro e no Controle`);
  } else if (kind === 'tarefa') {
    await flushAll(); await saveNow(ref.id, { checklist: [...tasksOf(S.nodes.get(ref.id)), { id: uid(), t, done: false, owner: '', flag: '', due: k, at: Date.now() }] });
    toast(`Tarefa com prazo em ${fmtLong(k)} no checklist de "${ref.title}"`);
  } else {
    await saveDayNotes(k, [...(S.days.get(k) || []), { id: uid(), t, done: false, node: ref ? ref.id : '', owner: '', at: Date.now() }]);
  }
  syncViews(ref?.id);
  $('#day-text')?.focus({ preventScroll: true });
}
ctrlEl.addEventListener('click', e => {
  if (e.target.closest('[data-dpk]')) return;
  if (e.target.closest('[data-day-close]')) { S.calDay = ''; return renderControl(); }
  const tg = e.target.closest('[data-day-toggle]'); if (tg && !RO) return dayToggle(tg.dataset.dayToggle);
  const dl = e.target.closest('[data-day-del]'); if (dl && !RO) return dayDel(dl.dataset.dayDel);
  const kd = e.target.closest('[data-day-kind]'); if (kd) { S.calKind = kd.dataset.dayKind; renderControl(); return $('#day-text')?.focus({ preventScroll: true }); }
  const op = e.target.closest('[data-day-open]'); if (op) return openDay(op.dataset.dayOpen);
  const cell = e.target.closest('.cal-day[data-day]'); if (cell && !e.target.closest('button')) openDay(cell.dataset.day);
});
ctrlEl.addEventListener('keydown', e => { const cell = e.target.closest?.('.cal-day[data-day]'); if (cell && e.target === cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDay(cell.dataset.day); } });
ctrlEl.addEventListener('input', e => { if (e.target.id === 'day-text') S.calText = e.target.value; });
ctrlEl.addEventListener('change', e => { if (e.target.id === 'day-ref') { S.calRef = e.target.value; renderControl(); } });
ctrlEl.addEventListener('submit', e => { if (e.target.id !== 'day-form') return; e.preventDefault(); if (!RO) daySubmit(); });

/* ---------- vistas ---------- */
function renderOtherViews() { if (S.view === 'indice') renderIndex(); if (S.view === 'quadro') renderBoard(); if (S.view === 'controle' && !ckDrag && !(ctrlEl.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !['ctrl-q', 'ck-input'].includes(document.activeElement.id))) renderControl(); }
function placeInk() {
  const b = $(`#views [aria-selected="true"]`); const ink = $('.seg-ink');
  ink.style.width = b.offsetWidth + 'px'; ink.style.transform = `translateX(${b.offsetLeft}px)`;
}
function setView(v) {
  S.view = v; closeMenu();
  document.querySelectorAll('#views [data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  placeInk();
  document.body.dataset.view = v;
  indexEl.hidden = v !== 'indice'; boardEl.hidden = v !== 'quadro'; ctrlEl.hidden = v !== 'controle';
  if (v === 'indice') renderIndex();
  if (v === 'quadro') renderBoard();
  if (v === 'controle') renderControl();
  // o espaço fica congelado atrás das outras vistas, desfocado pelo material da página
  if (v === 'mapa') G?.resumeAnimation();
  else G?.pauseAnimation();
}
$('#views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

/* ---------- filtros ---------- */
function bindFilter(sel, key) {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S[key] = b.dataset.v;
    $(sel).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    applyVisuals(); renderOtherViews(); updateFilterBadge();
  });
}
bindFilter('#f-owner', 'fOwner'); bindFilter('#f-status', 'fStatus');
const filtersEl = $('#filters'), filterBtn = $('#filter-btn');
function toggleFilters(open = filtersEl.hidden) {
  filtersEl.hidden = !open; filterBtn.setAttribute('aria-expanded', open);
  if (open) { const r = filterBtn.getBoundingClientRect(); filtersEl.style.left = Math.max(16, Math.min(r.right - filtersEl.offsetWidth, innerWidth - filtersEl.offsetWidth - 16)) + 'px'; }
}
filterBtn.addEventListener('click', () => toggleFilters());
addEventListener('pointerdown', e => { if (!filtersEl.hidden && !filtersEl.contains(e.target) && !filterBtn.contains(e.target)) toggleFilters(false); }, true);
function updateFilterBadge() { const n = (S.fOwner ? 1 : 0) + (S.fStatus ? 1 : 0); const b = $('#filter-badge'); b.hidden = !n; b.textContent = n; }
$('#cam-spin').addEventListener('click', () => setSpin(!spinning));
$('#cam-home').addEventListener('click', () => { if (S.open) closeDrawer(); G.cameraPosition(HOME, { x: 0, y: 0, z: 0 }, REDUCED ? 0 : 1400); });

function hint() {
  let seen = false; try { seen = localStorage.getItem('blatt-dica-v2') === '1'; } catch {}
  if (seen) return;
  const h = $('#hint'); h.hidden = false;
  h.querySelector('button').onclick = () => { h.hidden = true; try { localStorage.setItem('blatt-dica-v2', '1'); } catch {} };
}

/* ---------- busca ---------- */
const pal = $('#palette'), q = $('#q'), results = $('#results');
let sel = 0, items = [];
function openPalette() { pal.hidden = false; q.value = ''; search(); q.focus(); }
function closePalette() { pal.hidden = true; }
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function search() {
  const term = fold(q.value.trim());
  const r = root();
  if (!term) items = planets().map(n => ({ n, sub: plan(n).estrategia || n.description }));
  else {
    items = [];
    for (const n of S.nodes.values()) {
      let score = 0, sub = '';
      const t = fold(n.title);
      if (t.startsWith(term)) score = 100; else if (t.includes(term)) score = 80;
      const p = plan(n);
      const fields = [['description', n.description], ['plan', p.objetivo], ['plan', p.estrategia], ['plan', p.metrica], ['notes', n.notes], ...((n.checklist || []).map(c => ['tarefa', c.t])), ...((n.links || []).map(l => ['link', (l.t || '') + ' ' + l.url])), ...((n.files || []).map(f => ['anexo', f.name]))];
      for (const [k, v] of fields) {
        const i = fold(v).indexOf(term);
        if (i >= 0) { score = Math.max(score, k === 'description' || k === 'plan' ? 50 : 40); if (!sub) { const s = String(v); sub = (i > 30 ? '...' : '') + s.slice(Math.max(0, i - 30), i + 70); } }
      }
      if (score) items.push({ n, sub: sub || n.description, score });
    }
    items.sort((a, b) => b.score - a.score || depth(a.n.id) - depth(b.n.id)); items = items.slice(0, 30);
    const parent = S.nodes.get(S.open) || r;
    if (!RO) items.push({ create: true, parent, title: q.value.trim() });
  }
  sel = 0; drawResults();
}
function drawResults() {
  results.innerHTML = items.map((it, i) => it.create
    ? `<li class="create" role="option" aria-selected="${i === sel}" data-i="${i}" style="--c:${colorOf(it.parent.id)}"><i class="ph-light ph-plus"></i><div><b>Criar "${esc(it.title)}"</b><small>dentro de ${esc(it.parent.title)}</small></div><span class="k">Enter</span></li>`
    : `<li role="option" aria-selected="${i === sel}" data-i="${i}" style="--c:${colorOf(it.n.id)}"><span class="sw"></span><div style="min-width:0"><b>${esc(it.n.title)}</b><small>${esc(it.sub || path(it.n.id).slice(0, -1).map(p => p.title).join(' / '))}</small></div><span class="k">${esc(depth(it.n.id) === 1 ? 'Planeta' : depth(it.n.id) === 0 ? '' : areaOf(it.n.id).title)}</span></li>`).join('');
  results.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
async function choose(i) {
  const it = items[i]; if (!it) return;
  closePalette();
  if (it.create) await createNode(it.parent.id, it.title, true);
  else if (S.view === 'controle' && depth(it.n.id) >= 2) pickBlock(it.n.id);
  else openNode(it.n.id, S.view === 'mapa');
}
q.addEventListener('input', search);
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); drawResults(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); drawResults(); }
  if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
});
results.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) choose(+li.dataset.i); });
results.addEventListener('pointermove', e => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; drawResults(); } });
pal.addEventListener('click', e => { if (e.target === pal) closePalette(); });
$('#open-search').addEventListener('click', openPalette);

/* ---------- diálogos ---------- */
function confirmDialog(title, text, yes) {
  return new Promise(res => {
    const m = $('#modal'); $('#modal-t').textContent = title; $('#modal-p').textContent = text; $('#modal-yes').textContent = yes || 'Apagar';
    m.hidden = false; $('#modal-no').focus();
    const done = v => { m.hidden = true; $('#modal-yes').onclick = $('#modal-no').onclick = null; res(v); };
    $('#modal-yes').onclick = () => done(true); $('#modal-no').onclick = () => done(false);
    m.onclick = e => { if (e.target === m) done(false); };
    confirmDialog.cancel = () => done(false);
  });
}
function lightbox(src) { const lb = $('#lightbox'); lb.querySelector('img').src = src; lb.hidden = false; }
$('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800); }

addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPalette() : closePalette(); return; }
  if (e.key === '/' && !typing && pal.hidden) { e.preventDefault(); if (S.view === 'controle') $('#ctrl-q')?.focus(); else openPalette(); return; }
  if (e.key === 'Escape') {
    if (!dp.hidden) return closeDp();
    if (!menu.hidden) return closeMenu();
    if (!filtersEl.hidden) return toggleFilters(false);
    if (!$('#ask').hidden) return askName.cancel?.();
    if (!pal.hidden) return closePalette();
    if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; return; }
    if (!$('#modal').hidden) return confirmDialog.cancel?.();
    if (typing) { document.activeElement.blur(); return; }
    if (S.view === 'controle' && S.ctrlMode === 'calendario' && S.calDay && !S.open) { S.calDay = ''; return renderControl(); }
    if (S.open && S.expanded) return setExpanded(false);
    if (S.open) closeDrawer();
  }
});

/* ---------- sincronia ao vivo ---------- */
let refreshT;
function scheduleRefresh(external) { clearTimeout(refreshT); refreshT = setTimeout(() => refresh(external), 200); }
const strip = n => { const { updatedAt, ...r } = n; return JSON.stringify(r); };
async function refresh(external) {
  if (dragging) return scheduleRefresh(external);
  let list; try { list = await api.all(); } catch { return; }
  const fresh = new Map(list.map(n => [n.id, norm(n)]));
  const changed = [];
  for (const [id, n] of fresh) {
    const cur = S.nodes.get(id); const d = dirty.get(id); if (cur && d) for (const f of d) n[f] = cur[f]; // o que ainda não foi confirmado vale a versão da tela
    if (!cur || strip(cur) !== strip(n)) changed.push(id);
  }
  const removed = [...S.nodes.keys()].filter(id => !fresh.has(id));
  if (!changed.length && !removed.length) return;
  const isExternal = id => Date.now() - (recentSelf.get(id) || 0) > 2500;
  const externalChange = changed.some(isExternal) || removed.some(isExternal);
  S.nodes = fresh;
  syncGraph();
  changed.forEach(id => objs.has(id) && refreshNodeObject(id));
  applyVisuals(); renderLegend(); renderOtherViews();
  if (S.open && !S.nodes.has(S.open)) closeDrawer();
  else if (S.open && changed.includes(S.open)) {
    const editing = drawer.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!editing) { const sc = $('#d-scroll')?.scrollTop; renderDrawer(); if ($('#d-scroll')) $('#d-scroll').scrollTop = sc; }
  }
  if (external && externalChange) toast('Sistema atualizado com mudanças da outra pessoa');
}
function connectEvents() {
  const es = new EventSource('/api/eventos');
  es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.type === 'sync') return showSync(d); if (d.type === 'dia') return loadDays(); scheduleRefresh(d.type === 'externo'); } catch {} };
  api.info().then(i => i.sync?.on && showSync(i.sync)).catch(() => {});
  $('#gh-sync').addEventListener('click', () => { location.href = '/conectar'; });
}
// rede de segurança para a pasta sincronizada: confere de tempos em tempos, só com a aba visível
if (!RO) setInterval(() => { if (!document.hidden && !dragging && !pending.size) refresh(true); }, 15000);
if (!RO) addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(true); });

/* ---------- início ---------- */
(async function boot() {
  try {
    await loadLogo().catch(() => {});
    const list = await api.all();
    S.nodes = new Map(list.map(n => [n.id, norm(n)]));
    if (!root()) throw new Error('nenhum bloco raiz na pasta de dados');
    initGraph();
    syncGraph(true);
    renderLegend();
    refreshSocios();
    document.body.dataset.view = 'mapa';
    $('#save-all').addEventListener('click', saveAll); updateSaveBtn();
    if (!RO) { saveEl.dataset.state = 'idle'; saveEl.innerHTML = '<i class="ph-light ph-check"></i>'; saveEl.title = 'Tudo salvo'; }
    placeInk();
    setSpin(spinning);
    if (RO) { document.body.classList.add('ro'); const b = document.createElement('span'); b.className = 'ro-badge'; b.textContent = 'Visualização de ' + (window.__BLATT_FOTO__ || ''); $('.brand').appendChild(b); }
    else { connectEvents(); hint(); }
    loadDays();
    setTimeout(() => $('#boot').classList.add('gone'), 350);
  } catch (e) {
    const b = $('#boot'); b.classList.add('err'); b.querySelector('span').textContent = 'O sistema não carregou: ' + e.message;
  }
})();
addEventListener('resize', placeInk);
