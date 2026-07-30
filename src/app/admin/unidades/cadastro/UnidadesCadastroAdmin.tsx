'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Unidade } from '@/types/adminCore';
import { IcoEdit, IcoTrash, IcoSearch, IcoEmpty } from '../../_icons';
import styles from '../../crud.module.css';
import { cachedFetch, invalidateCache, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';

const BLANK = {
  cnpj: '', razao_social: '', nome_fantasia: '',
  tipo_unidade: 'matriz' as 'matriz' | 'filial',
  matriz_id: '',
  nome_contato: '', email: '',
  telefone: '', celular: '', homepage: '',
  logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '', cep: '',
};
type UndForm = typeof BLANK;

function maskCNPJ(v: string) {
  return v.replace(/\D/g, '').slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function maskCEP(v: string) {
  return v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

interface Props {
  initialUnidades: Unidade[];
}

export default function UnidadesCadastroAdmin({ initialUnidades }: Props) {
  const [unidades,   setUnidades]   = useState<Unidade[]>(initialUnidades);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<'todos' | 'matriz' | 'filial'>('todos');
  const [form,       setForm]       = useState<UndForm>(BLANK);
  const [editing,    setEditing]    = useState<Unidade | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [geoState,   setGeoState]   = useState<'idle' | 'geocoding' | 'ok' | 'failed'>('idle');
  const [cepLoading, setCepLoading] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; err: boolean } | null>(null);
  const [confirm,    setConfirm]    = useState<Unidade | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) invalidateCache(CACHE_KEYS.ADMIN_UNITS);
    setLoading(true);
    try {
      const data = await cachedFetch<Unidade[]>(
        CACHE_KEYS.ADMIN_UNITS,
        () => fetch('/api/admin/unidades-rh').then(r => r.json()),
        CACHE_TTL.ADMIN,
      );
      setUnidades(data);
    } catch {}
    setLoading(false);
  }, []);

  const matrizes = useMemo(() => unidades.filter(u => u.tipo_unidade === 'matriz'), [unidades]);

  const filtered = useMemo(() => {
    let list = unidades;
    if (filter === 'matriz') list = list.filter(u => u.tipo_unidade === 'matriz');
    if (filter === 'filial') list = list.filter(u => u.tipo_unidade === 'filial');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.nome_fantasia.toLowerCase().includes(q) ||
        u.razao_social.toLowerCase().includes(q) ||
        u.cnpj.includes(q) ||
        u.cidade.toLowerCase().includes(q)
      );
    }
    return list;
  }, [unidades, search, filter]);

  async function buscarCEP() {
    const cep = form.cep.replace(/\D/g, '');
    if (cep.length !== 8) { showToast('CEP inválido.', true); return; }
    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json() as Record<string, string>;
      if (data.erro) { showToast('CEP não encontrado.', true); return; }
      setForm(f => ({
        ...f,
        logradouro: data.logradouro ?? f.logradouro,
        bairro:     data.bairro     ?? f.bairro,
        cidade:     data.localidade ?? f.cidade,
        estado:     data.uf         ?? f.estado,
      }));
    } catch { showToast('Erro ao buscar CEP.', true); }
    finally   { setCepLoading(false); }
  }

  function startEdit(u: Unidade) {
    setEditing(u);
    setForm({
      cnpj:          u.cnpj,
      razao_social:  u.razao_social,
      nome_fantasia: u.nome_fantasia,
      tipo_unidade:  u.tipo_unidade,
      matriz_id:     u.matriz_id ?? '',
      nome_contato:  u.nome_contato,
      email:         u.email,
      telefone:      u.telefone    ?? '',
      celular:       u.celular     ?? '',
      homepage:      u.homepage    ?? '',
      logradouro:    u.logradouro,
      numero:        u.numero,
      complemento:   u.complemento ?? '',
      bairro:        u.bairro,
      cidade:        u.cidade,
      estado:        u.estado,
      cep:           u.cep,
    });
  }

  function cancelEdit() { setEditing(null); setForm(BLANK); setGeoState('idle'); }

  async function geocodeForm(f: UndForm): Promise<{ lat: number; lon: number } | null> {
    const parts = [f.logradouro, f.numero, f.bairro, f.cidade, f.estado, 'Brasil'].filter(Boolean);
    if (!parts.length) return null;
    try {
      const url  = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts.join(', '))}`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json() as Array<{ lat: string; lon: string }>;
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch { return null; }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const required = ['cnpj', 'razao_social', 'nome_fantasia', 'nome_contato',
                      'email', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep'];
    const missing = required.filter(k => !(form as Record<string, string>)[k]?.trim());
    if (missing.length) { showToast(`Preencha: ${missing.join(', ')}.`, true); return; }
    if (form.tipo_unidade === 'filial' && !form.matriz_id) {
      showToast('Selecione a matriz para esta filial.', true); return;
    }
    setSaving(true);
    try {
      setGeoState('geocoding');
      const coords = await geocodeForm(form);
      setGeoState(coords ? 'ok' : 'failed');
      if (!coords) showToast('Endereço não encontrado no mapa — coordenadas serão nulas.', false);

      const url    = editing ? `/api/admin/unidades-rh/${editing.id}` : '/api/admin/unidades-rh';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          matriz_id:   form.matriz_id || null,
          latitude_y:  coords?.lat ?? null,
          longitude_x: coords?.lon ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? 'Erro ao salvar.', true); return; }
      showToast(editing ? 'Unidade atualizada.' : 'Unidade criada.');
      cancelEdit();
      await load(true);
    } finally { setSaving(false); setGeoState('idle'); }
  }

  async function handleDelete(u: Unidade) {
    setConfirm(null);
    const res  = await fetch(`/api/admin/unidades-rh/${u.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? 'Erro ao excluir.', true); return; }
    showToast('Unidade removida.');
    if (editing?.id === u.id) cancelEdit();
    await load(true);
  }

  const accentColor = form.tipo_unidade === 'matriz' ? '#10b981' : '#3b82f6';

  return (
    <div className={styles.page}>

      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <span>Unidades</span>
        </div>
        <h1 className={styles.headerTitle}>Unidades</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={styles.headerBadge}>{unidades.filter(u => u.tipo_unidade === 'matriz').length} matrizes</span>
          <span className={styles.headerBadge} style={{ background: 'rgba(99,102,241,.10)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,.20)' }}>
            {unidades.filter(u => u.tipo_unidade === 'filial').length} filiais
          </span>
        </div>
      </div>

      <div className={styles.body}>

        {/* Formulário */}
        <div className={styles.formPanel}>
          {/* Faixa de cor por tipo */}
          <div style={{
            height: 3, flexShrink: 0,
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)`,
            transition: 'background .25s ease',
          }} />

          <div className={styles.formPanelHead}>
            <span className={styles.formPanelTitle}>{editing ? 'Editar unidade' : 'Nova unidade'}</span>
            {editing && <span className={`${styles.formPanelMode} ${styles.formPanelModeEdit}`}>Editando</span>}
          </div>

          <form className={styles.formBody} onSubmit={handleSubmit}>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Tipo</label>
                <select
                  className={styles.select}
                  value={form.tipo_unidade}
                  onChange={e => setForm(f => ({ ...f, tipo_unidade: e.target.value as 'matriz' | 'filial', matriz_id: '' }))}
                >
                  <option value="matriz">Matriz</option>
                  <option value="filial">Filial</option>
                </select>
              </div>

              {form.tipo_unidade === 'filial' ? (
                <div className={styles.field}>
                  <label className={styles.label}>Matriz <span className={styles.required}>*</span></label>
                  <select
                    className={styles.select}
                    value={form.matriz_id}
                    onChange={e => setForm(f => ({ ...f, matriz_id: e.target.value }))}
                  >
                    <option value="">— Selecione —</option>
                    {matrizes.map(m => (
                      <option key={m.id} value={m.id}>{m.nome_fantasia}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>CNPJ <span className={styles.required}>*</span></label>
                  <input
                    className={styles.input}
                    value={form.cnpj}
                    onChange={e => setForm(f => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
                    placeholder="00.000.000/0000-00"
                    disabled={!!editing}
                  />
                </div>
              )}
            </div>

            {form.tipo_unidade === 'filial' && (
              <div className={styles.field}>
                <label className={styles.label}>CNPJ <span className={styles.required}>*</span></label>
                <input
                  className={styles.input}
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                  disabled={!!editing}
                />
                {editing && <span className={styles.fieldHint}>CNPJ não pode ser alterado após criação.</span>}
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Razão Social <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={form.razao_social}
                onChange={e => setForm(f => ({ ...f, razao_social: e.target.value }))}
                placeholder="Empresa LTDA"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome Fantasia <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={form.nome_fantasia}
                onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))}
                placeholder="Empresa"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome do Contato <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={form.nome_contato}
                onChange={e => setForm(f => ({ ...f, nome_contato: e.target.value }))}
                placeholder="Maria Silva"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>E-mail <span className={styles.required}>*</span></label>
              <input
                type="email"
                className={styles.input}
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contato@empresa.com.br"
              />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Telefone</label>
                <input
                  className={styles.input}
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: maskPhone(e.target.value) }))}
                  placeholder="(11) 3000-0000"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Celular</label>
                <input
                  className={styles.input}
                  value={form.celular}
                  onChange={e => setForm(f => ({ ...f, celular: maskPhone(e.target.value) }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>

            {/* Endereço */}
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>CEP <span className={styles.required}>*</span></label>
                <input
                  className={styles.input}
                  value={form.cep}
                  onChange={e => setForm(f => ({ ...f, cep: maskCEP(e.target.value) }))}
                  placeholder="00000-000"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} style={{ opacity: 0, userSelect: 'none' }}>.</label>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={buscarCEP}
                  disabled={cepLoading}
                >
                  {cepLoading ? 'Buscando…' : 'Buscar CEP'}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Logradouro <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.logradouro} onChange={e => setForm(f => ({ ...f, logradouro: e.target.value }))} placeholder="Av. Paulista" />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Número <span className={styles.required}>*</span></label>
                <input className={styles.input} value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="1000" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Complemento</label>
                <input className={styles.input} value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Sala 42" />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Bairro <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Bela Vista" />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Cidade <span className={styles.required}>*</span></label>
                <input className={styles.input} value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} placeholder="São Paulo" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Estado <span className={styles.required}>*</span></label>
                <input className={styles.input} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
              </div>
            </div>
          </form>

          <div className={styles.formFoot}>
            {editing && (
              <button type="button" className={styles.btnSecondary} onClick={cancelEdit}>Cancelar</button>
            )}
            <button
              className={styles.btnPrimary}
              disabled={saving}
              onClick={handleSubmit as unknown as React.MouseEventHandler}
            >
              {saving && geoState === 'geocoding'
                ? 'Geocodificando…'
                : saving
                  ? 'Salvando…'
                  : editing
                    ? 'Salvar alterações'
                    : '+ Criar unidade'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader}>
            <div className={styles.statsChip}>
              <span className={styles.statsNum}>{filtered.length}</span>
              <span className={styles.statsLabel}>unidades</span>
            </div>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}><IcoSearch /></span>
              <input
                className={styles.searchInput}
                placeholder="Buscar unidade…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={e => setFilter(e.target.value as typeof filter)}
            >
              <option value="todos">Todas</option>
              <option value="matriz">Matrizes</option>
              <option value="filial">Filiais</option>
            </select>
          </div>

          <div className={styles.list}>
            {loading ? (
              [1, 2].map(i => (
                <div key={i} className={styles.row}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className={styles.skeleton} style={{ width: '50%', height: 13 }} />
                    <span className={styles.skeleton} style={{ width: '70%', height: 10 }} />
                    <span className={styles.skeleton} style={{ width: '40%', height: 10 }} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><IcoEmpty /></div>
                <p className={styles.emptyTitle}>Nenhuma unidade encontrada</p>
                <p className={styles.emptyText}>Cadastre a primeira unidade usando o formulário ao lado.</p>
              </div>
            ) : (
              filtered.map(u => (
                <div
                  key={u.id}
                  className={`${styles.row} ${editing?.id === u.id ? styles.rowSelected : ''}`}
                  onClick={() => startEdit(u)}
                >
                  <div className={styles.rowBody}>
                    <div className={styles.rowName}>{u.nome_fantasia}</div>
                    <div className={styles.rowSub}>{u.razao_social} · {u.cnpj}</div>
                    <div className={styles.rowSub}>{u.cidade}/{u.estado} · {u.nome_contato}</div>
                  </div>
                  <span className={u.tipo_unidade === 'matriz' ? styles.badgeMatriz : styles.badgeFilial}>
                    {u.tipo_unidade === 'matriz' ? 'Matriz' : 'Filial'}
                  </span>
                  <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} aria-label={`Editar ${u.nome_fantasia}`} onClick={() => startEdit(u)}><IcoEdit /></button>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Excluir ${u.nome_fantasia}`} onClick={() => setConfirm(u)}><IcoTrash /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          role={toast.err ? 'alert' : 'status'}
          aria-live={toast.err ? 'assertive' : 'polite'}
          aria-atomic="true"
          className={`${styles.toast} ${toast.err ? styles.toastErr : ''}`}
        >
          {toast.msg}
        </div>
      )}

      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)}>
          <div
            className={styles.confirmModal}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-unidade-title"
          >
            <div className={styles.confirmIcon} style={{ color: 'var(--danger)', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
              <IcoTrash size={32} />
            </div>
            <p className={styles.confirmTitle} id="confirm-unidade-title">Excluir unidade</p>
            <p className={styles.confirmMsg}>
              Remover <strong>{confirm.nome_fantasia}</strong>?<br />
              Esta ação não pode ser desfeita.
            </p>
            <div className={styles.confirmFoot}>
              <button className={styles.btnSecondary} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => handleDelete(confirm)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
