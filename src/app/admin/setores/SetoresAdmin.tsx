'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Setor, Unidade } from '@/types/adminCore';
import { IcoEdit, IcoTrash, IcoSearch, IcoEmpty } from '../_icons';
import styles from '../crud.module.css';
import { cachedFetch, invalidateCache, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';
import { getUnidadeCodigo } from '@/lib/data/unidades';
import { useUnidadeScoped } from '@/lib/hooks/useUnidadeScoped';
import UnidadeBreadcrumb from '../UnidadeBreadcrumb';

const PALETTE = [
  '#3b82f6','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#10b981','#06b6d4','#6366f1',
  '#f43f5e','#84cc16','#14b8a6','#0ea5e9','#a855f7',
  '#e879f9','#fb923c','#4ade80',
];

const BLANK = {
  nome: '', codigo_setor: '', sigla: '', descricao: '',
  cor_setor: '#3b82f6', parent_id: '', ativo: true,
};
type SetorForm = typeof BLANK;

function buildTree(setores: Setor[], cmp: (a: Setor, b: Setor) => number): Setor[] {
  const roots = [...setores.filter(s => !s.parent_id)].sort(cmp);
  const childrenOf = (id: string) => [...setores.filter(s => s.parent_id === id)].sort(cmp);
  const flatten = (list: Setor[]): Setor[] =>
    list.flatMap(s => [s, ...flatten(childrenOf(s.id))]);
  return flatten(roots);
}

interface Props {
  initialSetores: Setor[];
  /** Quando definida, restringe a tela a uma única unidade. */
  unidade?: Unidade;
}

export default function SetoresAdmin({ initialSetores, unidade }: Props) {
  const scoped = useUnidadeScoped<Setor>(unidade, s => s.id_unidade);
  const [setores,  setSetores]  = useState<Setor[]>(() => scoped(initialSetores));
  const [loading,  setLoading]  = useState(false);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [sortField, setSortField] = useState<'codigo' | 'nome'>('codigo');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [form,     setForm]     = useState<SetorForm>(BLANK);
  const [editing,  setEditing]  = useState<Setor | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; err: boolean } | null>(null);
  const [confirm,  setConfirm]  = useState<Setor | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) invalidateCache(CACHE_KEYS.ADMIN_SETORES);
    setLoading(true);
    try {
      const data = await cachedFetch<Setor[]>(
        CACHE_KEYS.ADMIN_SETORES,
        () => fetch('/api/admin/setores').then(r => r.json()),
        CACHE_TTL.ADMIN,
      );
      setSetores(scoped(data));
    } catch {}
    setLoading(false);
  }, [scoped]);

  const parentOptions = useMemo(
    () => setores.filter(s => !s.parent_id && s.ativo && (!editing || s.id !== editing.id)),
    [setores, editing],
  );

  const filtered = useMemo(() => {
    let list = setores;
    if (filter === 'ativos')   list = list.filter(s => s.ativo);
    if (filter === 'inativos') list = list.filter(s => !s.ativo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.nome.toLowerCase().includes(q) ||
        (s.sigla ?? '').toLowerCase().includes(q) ||
        (s.codigo_setor ?? '').toLowerCase().includes(q)
      );
    }
    const d = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: Setor, b: Setor) =>
      sortField === 'codigo'
        ? ((a.codigo_setor ?? '') < (b.codigo_setor ?? '') ? -1 : (a.codigo_setor ?? '') > (b.codigo_setor ?? '') ? 1 : 0) * d
        : a.nome.localeCompare(b.nome) * d;
    return buildTree(list, cmp);
  }, [setores, search, filter, sortField, sortDir]);

  function startEdit(s: Setor) {
    setEditing(s);
    setForm({
      nome:         s.nome,
      codigo_setor: s.codigo_setor ?? '',
      sigla:        s.sigla        ?? '',
      descricao:    s.descricao,
      cor_setor:    s.cor_setor    ?? '#3b82f6',
      parent_id:    s.parent_id    ?? '',
      ativo:        s.ativo,
    });
  }

  function cancelEdit() { setEditing(null); setForm(BLANK); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.descricao.trim()) {
      showToast('Preencha nome e descrição.', true);
      return;
    }
    setSaving(true);
    try {
      const url    = editing ? `/api/admin/setores/${editing.id}` : '/api/admin/setores';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          parent_id:    form.parent_id    || null,
          codigo_setor: form.codigo_setor || null,
          sigla:        form.sigla        || null,
          ...(unidade && !editing ? { id_unidade: getUnidadeCodigo(unidade) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? 'Erro ao salvar.', true); return; }
      showToast(editing ? 'Setor atualizado.' : 'Setor criado.');
      cancelEdit();
      await load(true);
    } finally { setSaving(false); }
  }

  async function handleDelete(s: Setor) {
    setConfirm(null);
    const res  = await fetch(`/api/admin/setores/${s.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? 'Erro ao excluir.', true); return; }
    showToast('Setor removido.');
    if (editing?.id === s.id) cancelEdit();
    await load(true);
  }

  return (
    <div className={styles.page}>

      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <UnidadeBreadcrumb unidade={unidade} />
          <span>Setores</span>
        </div>
        <h1 className={styles.headerTitle}>Setores</h1>
        <span className={styles.headerBadge}>{setores.filter(s => s.ativo).length} ativos</span>
      </div>

      <div className={styles.body}>

        {/* Formulário */}
        <div className={styles.formPanel}>
          {/* Faixa de cor do setor */}
          <div style={{
            height: 3, flexShrink: 0,
            background: `linear-gradient(90deg, ${form.cor_setor}, ${form.cor_setor}44)`,
            transition: 'background .25s ease',
          }} />

          <div className={styles.formPanelHead}>
            <span className={styles.formPanelTitle}>{editing ? 'Editar setor' : 'Novo setor'}</span>
            {editing && <span className={`${styles.formPanelMode} ${styles.formPanelModeEdit}`}>Editando</span>}
          </div>

          <form className={styles.formBody} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Nome <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Comercial"
                autoFocus
              />
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label}>Sigla</label>
                <input
                  className={styles.input}
                  value={form.sigla}
                  onChange={e => setForm(f => ({ ...f, sigla: e.target.value.toUpperCase() }))}
                  placeholder="COM"
                  maxLength={10}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Código</label>
                <input
                  className={styles.input}
                  value={form.codigo_setor}
                  onChange={e => setForm(f => ({ ...f, codigo_setor: e.target.value.toUpperCase() }))}
                  placeholder="SET001"
                  maxLength={40}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Setor pai</label>
              <select
                className={styles.select}
                value={form.parent_id}
                onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">— Setor principal (raiz) —</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}{p.sigla ? ` (${p.sigla})` : ''}</option>
                ))}
              </select>
              <span className={styles.fieldHint}>Deixe vazio para setor de nível 1.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Descrição <span className={styles.required}>*</span></label>
              <textarea
                className={styles.textarea}
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva o setor…"
                rows={2}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Cor do setor</label>
              <div className={styles.colorRow}>
                {PALETTE.map(cor => (
                  <button
                    key={cor}
                    type="button"
                    className={`${styles.colorSwatch} ${form.cor_setor === cor ? styles.colorSwatchActive : ''}`}
                    style={{ background: cor }}
                    onClick={() => setForm(f => ({ ...f, cor_setor: cor }))}
                    title={cor}
                  />
                ))}
              </div>
            </div>

            <div
              className={styles.toggleRow}
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              role="switch"
              aria-checked={form.ativo}
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setForm(f => ({ ...f, ativo: !f.ativo }))}
            >
              <span className={styles.toggleLabel}>Setor ativo</span>
              <span className={`${styles.toggle} ${form.ativo ? styles.toggleOn : ''}`} aria-hidden="true" />
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
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : '+ Criar setor'}
            </button>
          </div>
        </div>

        {/* Lista em árvore */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader}>
            <div className={styles.statsChip}>
              <span className={styles.statsNum}>{filtered.length}</span>
              <span className={styles.statsLabel}>setores</span>
            </div>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}><IcoSearch /></span>
              <input
                className={styles.searchInput}
                placeholder="Buscar setor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={e => setFilter(e.target.value as typeof filter)}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>

            <select
              className={styles.filterSelect}
              value={sortField}
              onChange={e => setSortField(e.target.value as typeof sortField)}
              title="Ordenar por"
            >
              <option value="codigo">Código</option>
              <option value="nome">Nome</option>
            </select>

            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Ordem crescente — clique para decrescente' : 'Ordem decrescente — clique para crescente'}
              style={{ width: 32, height: 32, fontSize: 14, flexShrink: 0 }}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div className={styles.list}>
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className={styles.row}>
                  <span className={styles.skeleton} style={{ width: 12, height: 12, borderRadius: '50%' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className={styles.skeleton} style={{ width: '55%', height: 13 }} />
                    <span className={styles.skeleton} style={{ width: '35%', height: 10 }} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><IcoEmpty /></div>
                <p className={styles.emptyTitle}>Nenhum setor encontrado</p>
                <p className={styles.emptyText}>Crie o primeiro setor usando o formulário ao lado.</p>
              </div>
            ) : (
              filtered.map(s => {
                const isChild = !!s.parent_id;
                const cor = s.cor_setor ?? '#64748b';
                return (
                  <div
                    key={s.id}
                    className={`${styles.row} ${editing?.id === s.id ? styles.rowSelected : ''} ${!s.ativo ? styles.rowInactive : ''}`}
                    style={{ paddingLeft: isChild ? 28 : 12, borderLeft: isChild ? `2px solid ${cor}40` : 'none' }}
                    onClick={() => startEdit(s)}
                  >
                    <div
                      className={styles.rowColorDot}
                      style={{ background: cor, width: isChild ? 8 : 10, height: isChild ? 8 : 10 }}
                    />
                    <div className={styles.rowBody}>
                      <div className={styles.rowName}>
                        {isChild && <span style={{ opacity: .4, marginRight: 4, fontSize: 11 }}>↳</span>}
                        {s.nome}
                        {s.sigla && (
                          <span style={{ color: 'var(--text-faint)', marginLeft: 6, fontSize: 11 }}>({s.sigla})</span>
                        )}
                      </div>
                      {s.codigo_setor && <div className={styles.rowSub}>Cód: {s.codigo_setor}</div>}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, flexShrink: 0,
                      color: isChild ? 'var(--text-faint)' : 'var(--text-muted)',
                      letterSpacing: '.04em',
                    }}>
                      {isChild ? 'Sub-setor' : 'Setor'}
                    </span>
                    <span className={s.ativo ? styles.badgeAtivo : styles.badgeInativo}>
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.iconBtn} aria-label={`Editar ${s.nome}`} onClick={() => startEdit(s)}><IcoEdit /></button>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Excluir ${s.nome}`} onClick={() => setConfirm(s)}><IcoTrash /></button>
                    </div>
                  </div>
                );
              })
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
            aria-labelledby="confirm-setor-title"
          >
            <div className={styles.confirmIcon} style={{ color: 'var(--danger)', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
              <IcoTrash size={32} />
            </div>
            <p className={styles.confirmTitle} id="confirm-setor-title">Excluir setor</p>
            <p className={styles.confirmMsg}>
              Remover <strong>{confirm.nome}</strong>?<br />
              Sub-setores e funcionários vinculados precisarão ser reatribuídos.
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
