// Cliente mínimo do Supabase, sem dependências: banco (REST), arquivos (Storage) e tempo real.
// Usado pelo servidor e pelo backup diário (scripts/backup.mjs).

export const BUCKET = 'anexos';

// Chave de um anexo no Storage: <bloco>/<id do anexo>. O nome original fica só nos dados do bloco,
// porque o Storage não aceita acentos e alguns símbolos em nomes de arquivo.
export const anexoKey = (nodeId, file) => `${nodeId}/${String(file).split('-')[0]}`;

export function supabase({ url, chave }) {
  const base = String(url || '').replace(/\/+$/, '');
  // chaves novas (sb_secret_...) vão só no apikey; as antigas (JWT service_role) também como Bearer
  const auth = chave.startsWith('sb_') ? { apikey: chave } : { apikey: chave, Authorization: `Bearer ${chave}` };
  const enc = k => k.split('/').map(encodeURIComponent).join('/');

  async function call(path, { method = 'GET', headers = {}, body, raw = false } = {}) {
    const r = await fetch(base + path, { method, headers: { ...auth, ...headers }, body });
    if (raw) return r;
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!r.ok) throw Object.assign(new Error(data?.message || data?.error || data?.msg || `${r.status} ${r.statusText}`), { status: r.status, data });
    return data;
  }
  const json = (method, path, body, extra = {}) => call(path, { method, headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

  const db = {
    select: (table, query = 'select=*') => call(`/rest/v1/${table}?${query}`, { headers: { Range: '0-9999' } }),
    upsert: (table, rows) => json('POST', `/rest/v1/${table}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    insert: (table, rows) => json('POST', `/rest/v1/${table}`, rows, { Prefer: 'return=minimal' }),
    remove: (table, query) => call(`/rest/v1/${table}?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
  };

  const storage = {
    async ensureBucket() {
      try { await call(`/storage/v1/bucket/${BUCKET}`); }
      catch (e) { if (e.status !== 404 && e.status !== 400) throw e; await json('POST', '/storage/v1/bucket', { id: BUCKET, name: BUCKET, public: false }); }
    },
    upload: (key, buf, type) => call(`/storage/v1/object/${BUCKET}/${enc(key)}`, { method: 'POST', headers: { 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'true' }, body: buf }),
    download: key => call(`/storage/v1/object/authenticated/${BUCKET}/${enc(key)}`, { raw: true }),
    move: (from, to) => json('POST', '/storage/v1/object/move', { bucketId: BUCKET, sourceKey: from, destinationKey: to }),
    list: prefix => json('POST', `/storage/v1/object/list/${BUCKET}`, { prefix, limit: 1000, offset: 0 }),
    // links temporários: o navegador envia e baixa direto do Storage, sem passar pelo servidor
    async signUpload(key) {
      const r = await json('POST', `/storage/v1/object/upload/sign/${BUCKET}/${enc(key)}`, {}, { 'x-upsert': 'true' });
      return base + '/storage/v1' + r.url;
    },
    async signDownload(key, download, expiresIn = 3600) {
      const r = await json('POST', `/storage/v1/object/sign/${BUCKET}/${enc(key)}`, { expiresIn });
      return base + '/storage/v1' + r.signedURL + (download ? `&download=${encodeURIComponent(download)}` : '');
    },
  };

  // Tempo real: avisa quando outra pessoa muda um bloco ou o dia. Reconecta sozinho se cair.
  function realtime(onChange, onState = () => {}) {
    let ws, beat, ref = 0, closed = false, wait = 1000;
    const send = m => ws?.readyState === 1 && ws.send(JSON.stringify({ ...m, ref: String(++ref) }));
    function open() {
      ws = new WebSocket(`${base.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(chave)}&vsn=1.0.0`);
      ws.onopen = () => {
        wait = 1000;
        const payload = { config: { broadcast: { self: false }, presence: { key: '' }, private: false,
          postgres_changes: [{ event: '*', schema: 'public', table: 'nos' }, { event: '*', schema: 'public', table: 'dias' }] } };
        if (!chave.startsWith('sb_')) payload.access_token = chave;
        send({ topic: 'realtime:blatt', event: 'phx_join', payload, join_ref: '1' });
        beat = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'phx_reply' && m.topic === 'realtime:blatt') onState(m.payload?.status === 'ok' ? 'ok' : 'erro');
        if (m.event === 'postgres_changes') { const d = m.payload?.data || {}; onChange({ table: d.table, id: d.record?.id ?? d.record?.date ?? d.old_record?.id ?? d.old_record?.date }); }
      };
      ws.onclose = () => { clearInterval(beat); onState('offline'); if (!closed) setTimeout(open, wait = Math.min(wait * 2, 30000)); };
      ws.onerror = () => {};
    }
    open();
    return () => { closed = true; clearInterval(beat); ws?.close(); };
  }

  return { base, db, storage, realtime };
}

// SQL que cria a estrutura no Supabase. Colado uma vez no SQL Editor do projeto.
export const SQL = `-- Sistema Blatt: estrutura do banco
create table if not exists public.nos (
  id text primary key,
  parent text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.dias (
  date text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.lixeira (
  id bigint generated always as identity primary key,
  tipo text not null,
  ref text,
  data jsonb,
  apagado_em timestamptz not null default now()
);
-- só o sistema (chave secreta) acessa os dados
alter table public.nos enable row level security;
alter table public.dias enable row level security;
alter table public.lixeira enable row level security;
-- tempo real: avisa quando um bloco ou um dia muda
do $$ begin
  alter publication supabase_realtime add table public.nos, public.dias;
exception when duplicate_object then null; end $$;
-- arquivos e fotos
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false) on conflict (id) do nothing;
`;
