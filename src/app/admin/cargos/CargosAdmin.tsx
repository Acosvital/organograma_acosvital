'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Cargo, Unidade } from '@/types/adminCore';
import { CARGO_LEVELS, NVL_LABELS } from '@/types/adminCore';
import { levelColors } from '@/data/orgData';
import { IcoEdit, IcoTrash, IcoSearch, IcoEmpty } from '../_icons';
import styles from '../crud.module.css';
import { cachedFetch, invalidateCache, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';
import { getUnidadeCodigo } from '@/lib/data/unidades';
import { useUnidadeScoped } from '@/lib/hooks/useUnidadeScoped';
import UnidadeBreadcrumb from '../UnidadeBreadcrumb';

function LvlBadge({ nvl }: { nvl: number }) {
  const color = levelColors[nvl] ?? '#94a3b8';
  return (
    <span
      className={styles.lvlBadge}
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      Nv {nvl} · {NVL_LABELS[nvl] ?? 'Desconhecido'}
    </span>
  );
}

const BLANK = { nome: '', nvl_permissao: 4, descricao: '', ativo: true };

interface Props {
  initialCargos: Cargo[];
  /** Quando definida, restringe a tela a uma única unidade. */
  unidade?: Unidade;
}

export default function CargosAdmin({ initialCargos, unidade }: Props) {
  const scoped = useUnidadeScoped<Cargo>(unidade, c => c.codigo_empresa);
  const [cargos,  setCargos]  = useState<Cargo[]>(() => scoped(initialCargos));
  const [loading, setLoading] = useState(false);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [sortField, setSortField] = useState<'nivel' | 'nome'>('nivel');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [form,    setForm]    = useState(BLANK);
  const [editing, setEditing] = useState<Cargo | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; err: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Cargo | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) invalidateCache(CACHE_KEYS.ADMIN_CARGOS);
    setLoading(true);
    try {
      const data = await cachedFetch<Cargo[]>(
        CACHE_KEYS.ADMIN_CARGOS,
        () => fetch('/api/admin/cargos').then(r => r.json()),
        CACHE_TTL.ADMIN,
      );
      setCargos(scoped(data));
    } catch {}
    setLoading(false);
  }, [scoped]);

  const filtered = useMemo(() => {
    let list = cargos;
    if (filter === 'ativos')   list = list.filter(c => c.ativo);
    if (filter === 'inativos') list = list.filter(c => !c.ativo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.nome.toLowerCase().includes(q) ||
        c.descricao.toLowerCase().includes(q) ||
        String(c.nvl_permissao).includes(q)
      );
    }
    const d = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) =>
      sortField === 'nivel'
        ? (a.nvl_permissao - b.nvl_permissao) * d
        : a.nome.localeCompare(b.nome) * d,
    );
  }, [cargos, search, filter, sortField, sortDir]);

  function startEdit(c: Cargo) {
    setEditing(c);
    setForm({ nome: c.nome, nvl_permissao: c.nvl_permissao, descricao: c.descricao, ativo: c.ativo });
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
      const url    = editing ? `/api/admin/cargos/${editing.id}` : '/api/admin/cargos';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(unidade && !editing ? { codigo_empresa: getUnidadeCodigo(unidade) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? 'Erro ao salvar.', true); return; }
      showToast(editing ? 'Cargo atualizado.' : 'Cargo criado.');
      cancelEdit();
      await load(true);
    } finally { setSaving(false); }
  }

  async function handleDelete(c: Cargo) {
    setConfirm(null);
    const res  = await fetch(`/api/admin/cargos/${c.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? 'Erro ao excluir.', true); return; }
    showToast('Cargo removido.');
    if (editing?.id === c.id) cancelEdit();
    await load(true);
  }

  const selectedColor = levelColors[form.nvl_permissao] ?? '#94a3b8';

  return (
    <div className={styles.page}>

      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <UnidadeBreadcrumb unidade={unidade} />
          <span>Cargos</span>
        </div>
        <h1 className={styles.headerTitle}>Cargos</h1>
        <span className={styles.headerBadge}>{cargos.filter(c => c.ativo).length} ativos</span>
      </div>

      <div className={styles.body}>

        {/* Formulário */}
        <div className={styles.formPanel}>
          {/* Faixa de nível colorida */}
          <div style={{
            height: 3, flexShrink: 0,
            background: `linear-gradient(90deg, ${selectedColor}, ${selectedColor}44)`,
            transition: 'background .3s ease',
          }} />

          <div className={styles.formPanelHead}>
            <span className={styles.formPanelTitle}>{editing ? 'Editar cargo' : 'Novo cargo'}</span>
            {editing && <span className={`${styles.formPanelMode} ${styles.formPanelModeEdit}`}>Editando</span>}
          </div>

          <form className={styles.formBody} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Nome <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Analista Sênior"
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nível hierárquico <span className={styles.required}>*</span></label>
              <select
                className={styles.select}
                value={form.nvl_permissao}
                onChange={e => setForm(f => ({ ...f, nvl_permissao: Number(e.target.value) }))}
              >
                {CARGO_LEVELS.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl} — {NVL_LABELS[lvl]}</option>
                ))}
              </select>
              <span className={styles.fieldHint}>Faixa válida: 0–12. Níveis 2 e 3 são reservados para setores.</span>
            </div>

            {/* Preview de nível */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 6,
              background: `${selectedColor}0d`, border: `1px solid ${selectedColor}22`,
              fontSize: 11.5, color: 'var(--text-muted)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: selectedColor, flexShrink: 0 }} />
              {NVL_LABELS[form.nvl_permissao] ?? `Nível ${form.nvl_permissao}`}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Descrição <span className={styles.required}>*</span></label>
              <textarea
                className={styles.textarea}
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva as responsabilidades deste cargo…"
                rows={3}
              />
            </div>

            <div
              className={styles.toggleRow}
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              role="switch"
              aria-checked={form.ativo}
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setForm(f => ({ ...f, ativo: !f.ativo }))}
            >
              <span className={styles.toggleLabel}>Cargo ativo</span>
              <span className={`${styles.toggle} ${form.ativo ? styles.toggleOn : ''}`} aria-hidden="true" />
            </div>
          </form>

          <div className={styles.formFoot}>
            {editing && (
              <button type="button" className={styles.btnSecondary} onClick={cancelEdit}>Cancelar</button>
            )}
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving}
              onClick={handleSubmit as unknown as React.MouseEventHandler}
            >
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : '+ Criar cargo'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className={styles.listPanel}>
          <div className={styles.listHeader}>
            <div className={styles.statsChip}>
              <span className={styles.statsNum}>{filtered.length}</span>
              <span className={styles.statsLabel}>cargos</span>
            </div>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}><IcoSearch /></span>
              <input
                className={styles.searchInput}
                placeholder="Buscar cargo…"
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
              <option value="nivel">Nível</option>
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
              [1, 2, 3, 4].map(i => (
                <div key={i} className={styles.row} style={{ gap: 12 }}>
                  <span className={styles.skeleton} style={{ width: 28, height: 28, borderRadius: 8 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className={styles.skeleton} style={{ width: '60%', height: 13 }} />
                    <span className={styles.skeleton} style={{ width: '40%', height: 10 }} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><IcoEmpty /></div>
                <p className={styles.emptyTitle}>Nenhum cargo encontrado</p>
                <p className={styles.emptyText}>Crie o primeiro cargo usando o formulário ao lado.</p>
              </div>
            ) : (
              filtered.map(c => (
                <div
                  key={c.id}
                  className={`${styles.row} ${editing?.id === c.id ? styles.rowSelected : ''} ${!c.ativo ? styles.rowInactive : ''}`}
                  onClick={() => startEdit(c)}
                >
                  <div
                    className={styles.rowColorDot}
                    style={{ background: levelColors[c.nvl_permissao] ?? '#94a3b8' }}
                  />
                  <div className={styles.rowBody}>
                    <div className={styles.rowName}>{c.nome}</div>
                    <div className={styles.rowSub}>{c.descricao}</div>
                  </div>
                  <LvlBadge nvl={c.nvl_permissao} />
                  <span className={c.ativo ? styles.badgeAtivo : styles.badgeInativo}>
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} aria-label={`Editar ${c.nome}`} onClick={() => startEdit(c)}><IcoEdit /></button>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Excluir ${c.nome}`} onClick={() => setConfirm(c)}><IcoTrash /></button>
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
            aria-labelledby="confirm-cargo-title"
          >
            <div className={styles.confirmIcon} style={{ color: 'var(--danger)', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
              <IcoTrash size={32} />
            </div>
            <p className={styles.confirmTitle} id="confirm-cargo-title">Excluir cargo</p>
            <p className={styles.confirmMsg}>
              Tem certeza que deseja remover <strong>{confirm.nome}</strong>?<br />
              Funcionários com este cargo precisarão ser atualizados.
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
