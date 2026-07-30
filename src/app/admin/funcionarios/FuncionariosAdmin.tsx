'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';
import type { Funcionario, Cargo, Setor, Unidade } from '@/types/adminCore';
import { NVL_LABELS } from '@/types/adminCore';
import { levelColors } from '@/data/orgData';
import styles from '../crud.module.css';
import { cachedFetch, invalidateCache, invalidateCachePrefix, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';

// ── Máscaras ──────────────────────────────────────────────────────────────────
const maskCPF   = (v: string) => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{2})$/,'$1-$2');
const maskPhone = (v: string) => { const d=v.replace(/\D/g,'').slice(0,11); return d.length<=10?d.replace(/^(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').trim():d.replace(/^(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').trim(); };
const maskCEP   = (v: string) => v.replace(/\D/g,'').slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2');

// ── Ícones SVG ────────────────────────────────────────────────────────────────
const IcoUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);
const IcoFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IcoPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17"/>
  </svg>
);
const IcoPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform .22s cubic-bezier(0.16,1,0.3,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IcoSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IcoPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcoTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IcoUsers = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IcoWarn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

// ── Select pesquisável ────────────────────────────────────────────────────────
interface SSOption { id: string; label: string; sub?: string }

function SearchableSelect({
  value, onChange, options, placeholder = 'Selecione…', searchPlaceholder = 'Buscar…',
}: {
  value: string;
  onChange: (id: string) => void;
  options: SSOption[];
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(-1);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.id === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery(''); setFocused(-1);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Foca input ao abrir
  useEffect(() => {
    if (open) { setFocused(-1); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  // Scroll do item focado
  useEffect(() => {
    if (focused < 0 || !listRef.current) return;
    const el = listRef.current.children[focused] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(''); setFocused(-1); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setFocused(-1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(i => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && focused >= 0 && filtered[focused]) { e.preventDefault(); pick(filtered[focused].id); }
  };

  return (
    <div ref={wrapRef} className={styles.ssWrap}>
      <button
        type="button"
        className={styles.ssTrigger}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected
          ? <span className={styles.ssTriggerLabel}>{selected.label}</span>
          : <span className={styles.ssTriggerPlaceholder}>{placeholder}</span>}
        <IcoChevron open={open} />
      </button>

      {open && (
        <div className={styles.ssDropdown}>
          <div className={styles.ssSearchWrap}>
            <IcoSearch />
            <input
              ref={inputRef}
              className={styles.ssSearchInput}
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setFocused(-1); }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul ref={listRef} className={styles.ssList} role="listbox">
            {filtered.length === 0
              ? <li className={styles.ssEmpty}>Nenhum resultado</li>
              : filtered.map((o, i) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={o.id === value}
                  className={[
                    styles.ssItem,
                    o.id === value  ? styles.ssItemSelected  : '',
                    i === focused   ? styles.ssItemFocused   : '',
                  ].join(' ')}
                  onMouseDown={() => pick(o.id)}
                  onMouseEnter={() => setFocused(i)}
                >
                  {o.label}
                  {o.sub && <span style={{ marginLeft: 6, opacity: .55, fontSize: 11 }}>{o.sub}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Seção collapsível ─────────────────────────────────────────────────────────
function Section({
  icon, title, badge, open, onToggle, sectionId, children,
}: {
  icon: React.ReactNode; title: string; badge?: string;
  open: boolean; onToggle: () => void;
  sectionId: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHead}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={sectionId}
      >
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionHeadIcon} aria-hidden="true">{icon}</span>
          <span className={styles.sectionHeadTitle}>{title}</span>
          {badge && <span className={styles.sectionHeadBadge}>{badge}</span>}
        </div>
        <span className={styles.sectionChevron} aria-hidden="true"><IcoChevron open={open} /></span>
      </button>
      {open && <div id={sectionId} className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── Nível pill ────────────────────────────────────────────────────────────────
function NvlPill({ nvl }: { nvl: number }) {
  const color = levelColors[nvl] ?? '#94a3b8';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
      padding: '1px 7px', borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}30`,
    }}>
      Nv {nvl} · {NVL_LABELS[nvl] ?? `N${nvl}`}
    </span>
  );
}

// ── Formulário de funcionário ─────────────────────────────────────────────────
const BLANK_FORM = {
  nome_completo: '', id_cargo: '', id_setor: '', id_unidade: '',
  photo_url: '', cpf: '', rg: '', cnpj: '',
  contrato_tipo: '' as '' | 'CLT' | 'PJ' | 'Freelancer',
  jornada_trabalho: '' as '' | 'Integral' | 'Meio Período' | 'Flexível',
  data_nascimento: '', data_admissao: '', data_desligamento: '',
  telefone: '', celular: '', homepage: '',
  logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '', cep: '',
  parent_node_id: '',
  co_diretor_nome: '',
  co_id: '',
  co_cpf: '', co_rg: '', co_cnpj: '',
  co_contrato_tipo:    '' as '' | 'CLT' | 'PJ' | 'Freelancer',
  co_jornada_trabalho: '' as '' | 'Integral' | 'Meio Período' | 'Flexível',
  co_data_nascimento: '', co_data_admissao: '', co_data_desligamento: '',
  co_telefone: '', co_celular: '', co_homepage: '',
  co_logradouro: '', co_numero: '', co_complemento: '',
  co_bairro: '', co_cidade: '', co_estado: '', co_cep: '',
};
type FuncForm = typeof BLANK_FORM;

interface DrawerProps {
  form: FuncForm;
  setForm: React.Dispatch<React.SetStateAction<FuncForm>>;
  editing: Funcionario | null;
  cargos: Cargo[];
  setores: Setor[];
  unidades: Unidade[];
  funcionarios: Funcionario[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onDelete: () => void;
}

function FuncionarioDrawer({
  form, setForm, editing, cargos, setores, unidades, funcionarios,
  saving, onClose, onSubmit, onDelete,
}: DrawerProps) {
  const [openSection, setOpenSection] = useState<string>('dados');
  const toggle = (k: string) => setOpenSection(cur => cur === k ? '' : k);
  const [reportsToSearch, setReportsToSearch] = useState('');

  // Fechar com Escape (keyboard accessibility)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);
  const sections = {
    dados:       openSection === 'dados',
    contrato:    openSection === 'contrato',
    contato:     openSection === 'contato',
    endereco:    openSection === 'endereco',
    co_contrato: openSection === 'co_contrato',
    co_contato:  openSection === 'co_contato',
    co_endereco: openSection === 'co_endereco',
  };

  const selectedCargo = useMemo(() => cargos.find(c => c.id === form.id_cargo), [cargos, form.id_cargo]);
  const isDirector    = selectedCargo?.nvl_permissao === 0;
  const levelColor    = selectedCargo ? (levelColors[selectedCargo.nvl_permissao] ?? '#64748b') : '#64748b';

  const [isPaired, setIsPaired] = useState(() => form.co_diretor_nome !== '');
  const coDirRef = useRef<HTMLDivElement>(null);

  const initials = form.nome_completo
    ? form.nome_completo.trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '';
  const coInitials = form.co_diretor_nome
    ? form.co_diretor_nome.trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '';

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Editar funcionário' : 'Novo funcionário'}
        onKeyDown={handleKeyDown}
      >

        {/* Barra colorida por nível — fora do drawerHead para não quebrar o flex */}
        <div style={{
          height: 3,
          flexShrink: 0,
          background: selectedCargo
            ? `linear-gradient(90deg, ${levelColor}, ${levelColor}55)`
            : 'var(--border-subtle)',
        }} />

        {/* Cabeçalho */}
        <div className={styles.drawerHead}>
          {isPaired ? (
            <div className={styles.avatarPair}>
              <div className={styles.funcAvatarWrap} style={{ '--av-color': levelColor } as React.CSSProperties}>
                {form.photo_url
                  ? <img src={form.photo_url} alt="" className={styles.funcAvatarImg} />
                  : <span className={styles.funcAvatarInitials}>{initials || '?'}</span>}
              </div>
              <span className={styles.avatarPairSep}>&amp;</span>
              <div className={styles.funcAvatarWrap} style={{ '--av-color': levelColor } as React.CSSProperties}>
                <span className={styles.funcAvatarInitials}>{coInitials || '?'}</span>
              </div>
            </div>
          ) : (
            <div className={styles.funcAvatarWrap} style={{ '--av-color': levelColor } as React.CSSProperties}>
              {form.photo_url
                ? <img src={form.photo_url} alt="" className={styles.funcAvatarImg} />
                : <span className={styles.funcAvatarInitials}>{initials || '?'}</span>}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.drawerTitle}>
              {editing ? (form.nome_completo || 'Editar funcionário') : 'Novo funcionário'}
            </div>
            {selectedCargo && (
              <div style={{ marginTop: 4 }}>
                <NvlPill nvl={selectedCargo.nvl_permissao} />
              </div>
            )}
          </div>

          <button className={styles.drawerClose} onClick={onClose} aria-label="Fechar drawer"><IcoX /></button>
        </div>

        <form className={styles.drawerBody} onSubmit={onSubmit}>

          {/* Identificação */}
          <Section icon={<IcoUser />} title="Identificação" badge="obrigatório" open={sections.dados} onToggle={() => toggle('dados')} sectionId="drw-dados">
            <div className={styles.field}>
              <label className={styles.label}>Nome completo <span className={styles.required}>*</span></label>
              <input autoFocus className={styles.input} value={form.nome_completo}
                onChange={e => setForm(f => ({ ...f, nome_completo: e.target.value }))}
                placeholder="Nome completo do funcionário" />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Cargo <span className={styles.required}>*</span></label>
              <SearchableSelect
                value={form.id_cargo}
                onChange={id => setForm(f => ({ ...f, id_cargo: id, parent_node_id: '' }))}
                options={cargos.filter(c => c.ativo).map(c => ({
                  id: c.id,
                  label: `Nv ${c.nvl_permissao} · ${c.nome}`,
                }))}
                placeholder="Selecione o cargo"
                searchPlaceholder="Buscar cargo…"
              />
            </div>

            {selectedCargo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 6,
                background: `${levelColor}0d`, border: `1px solid ${levelColor}22`,
                fontSize: 11.5, color: 'var(--text-muted)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: levelColor, flexShrink: 0 }} />
                {NVL_LABELS[selectedCargo.nvl_permissao] ?? `Nível ${selectedCargo.nvl_permissao}`}
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Setor <span className={styles.required}>*</span></label>
              <SearchableSelect
                value={form.id_setor}
                onChange={id => setForm(f => ({ ...f, id_setor: id, parent_node_id: '' }))}
                options={setores.filter(s => s.ativo).map(s => ({
                  id: s.id,
                  label: `${s.parent_id ? '↳ ' : ''}${s.nome}`,
                  sub: s.sigla ?? undefined,
                }))}
                placeholder="Selecione o setor"
                searchPlaceholder="Buscar setor…"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Unidade <span className={styles.required}>*</span></label>
              <SearchableSelect
                value={form.id_unidade}
                onChange={id => setForm(f => ({ ...f, id_unidade: id }))}
                options={unidades.map(u => ({
                  id: u.id,
                  label: u.nome_fantasia,
                  sub: u.tipo_unidade,
                }))}
                placeholder="Selecione a unidade"
                searchPlaceholder="Buscar unidade…"
              />
            </div>

            {!isDirector && (() => {
              const cargoMap = new Map(cargos.map(c => [c.id, c]));
              const candidatos = funcionarios
                .filter(f => f.id !== editing?.id && f.id_setor === form.id_setor)
                .sort((a, b) => {
                  const na = cargoMap.get(a.id_cargo)?.nvl_permissao ?? 9;
                  const nb = cargoMap.get(b.id_cargo)?.nvl_permissao ?? 9;
                  return na - nb || a.nome_completo.localeCompare(b.nome_completo);
                });
              const q = reportsToSearch.toLowerCase();
              const filtrados = q
                ? candidatos.filter(f =>
                    f.nome_completo.toLowerCase().includes(q) ||
                    (f.cargo_nome ?? '').toLowerCase().includes(q)
                  )
                : candidatos;
              return (
                <div className={styles.field}>
                  <label className={styles.label}>
                    Reporta a{' '}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span>
                  </label>
                  {candidatos.length > 5 && (
                    <input
                      className={styles.input}
                      style={{ marginBottom: 4 }}
                      placeholder="Buscar gestor…"
                      value={reportsToSearch}
                      onChange={e => setReportsToSearch(e.target.value)}
                    />
                  )}
                  <select
                    className={styles.select}
                    value={form.parent_node_id}
                    onChange={e => setForm(f => ({ ...f, parent_node_id: e.target.value }))}
                  >
                    <option value="">— Automático pelo setor</option>
                    {filtrados.map(f => {
                      const nvl = cargoMap.get(f.id_cargo)?.nvl_permissao;
                      const cargo = f.cargo_nome ?? cargoMap.get(f.id_cargo)?.nome ?? '';
                      return (
                        <option key={f.id} value={f.id}>
                          {nvl !== undefined ? `Nv${nvl} · ` : ''}{f.nome_completo}{cargo ? ` — ${cargo}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, display: 'block' }}>
                    Deixe em branco para hierarquia automática.
                  </span>
                </div>
              );
            })()}

            <div className={styles.field}>
              <label className={styles.label}>URL da foto</label>
              <input className={styles.input} value={form.photo_url}
                onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))}
                placeholder="https://…" />
            </div>

            {/* Toggle co-diretor */}
            {isDirector && (
              <label className={styles.coDirToggle}>
                <input type="checkbox" checked={isPaired}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIsPaired(checked);
                    if (!checked) setForm(f => ({ ...f, co_diretor_nome: '' }));
                    else setTimeout(() => coDirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                />
                Compartilhar card com co-diretor
              </label>
            )}

            {isDirector && isPaired && (
              <div ref={coDirRef} className={styles.coDirSection}>
                <span className={styles.coDirLabel}>Co-Diretor</span>
                <div className={styles.field}>
                  <label className={styles.label}>Nome do co-diretor <span className={styles.required}>*</span></label>
                  <input className={styles.input} value={form.co_diretor_nome}
                    onChange={e => setForm(f => ({ ...f, co_diretor_nome: e.target.value }))}
                    placeholder="Nome do co-diretor" />
                </div>
              </div>
            )}
          </Section>

          {/* Contrato, Contato e Endereço — ocultos para Diretoria */}
          {!isDirector && (
            <>
              <Section icon={<IcoFile />} title="Contrato & Documentos" open={sections.contrato} onToggle={() => toggle('contrato')} sectionId="drw-contrato">
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Tipo de contrato</label>
                    <select className={styles.select} value={form.contrato_tipo}
                      onChange={e => setForm(f => ({ ...f, contrato_tipo: e.target.value as FuncForm['contrato_tipo'] }))}>
                      <option value="">Selecione</option>
                      <option value="CLT">CLT</option>
                      <option value="PJ">PJ</option>
                      <option value="Freelancer">Freelancer</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Jornada</label>
                    <select className={styles.select} value={form.jornada_trabalho}
                      onChange={e => setForm(f => ({ ...f, jornada_trabalho: e.target.value as FuncForm['jornada_trabalho'] }))}>
                      <option value="">Selecione</option>
                      <option value="Integral">Integral</option>
                      <option value="Meio Período">Meio Período</option>
                      <option value="Flexível">Flexível</option>
                    </select>
                  </div>
                </div>
                {form.contrato_tipo !== 'PJ' && (
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>CPF</label>
                      <input className={styles.input} value={form.cpf}
                        onChange={e => setForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))}
                        placeholder="000.000.000-00" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>RG</label>
                      <input className={styles.input} value={form.rg}
                        onChange={e => setForm(f => ({ ...f, rg: e.target.value }))}
                        placeholder="00.000.000-0" />
                    </div>
                  </div>
                )}
                {form.contrato_tipo === 'PJ' && (
                  <div className={styles.field}>
                    <label className={styles.label}>CNPJ</label>
                    <input className={styles.input} value={form.cnpj}
                      onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                      placeholder="00.000.000/0000-00" />
                  </div>
                )}
                <div className={styles.row3}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nascimento</label>
                    <input type="date" className={styles.input} value={form.data_nascimento}
                      onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Admissão</label>
                    <input type="date" className={styles.input} value={form.data_admissao}
                      onChange={e => setForm(f => ({ ...f, data_admissao: e.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Desligamento</label>
                    <input type="date" className={styles.input} value={form.data_desligamento}
                      onChange={e => setForm(f => ({ ...f, data_desligamento: e.target.value }))} />
                  </div>
                </div>
              </Section>

              <Section icon={<IcoPhone />} title="Contato" open={sections.contato} onToggle={() => toggle('contato')} sectionId="drw-contato">
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Telefone</label>
                    <input className={styles.input} value={form.telefone}
                      onChange={e => setForm(f => ({ ...f, telefone: maskPhone(e.target.value) }))}
                      placeholder="(11) 3000-0000" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Celular</label>
                    <input className={styles.input} value={form.celular}
                      onChange={e => setForm(f => ({ ...f, celular: maskPhone(e.target.value) }))}
                      placeholder="(11) 99999-0000" />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Website / LinkedIn</label>
                  <input className={styles.input} value={form.homepage}
                    onChange={e => setForm(f => ({ ...f, homepage: e.target.value }))}
                    placeholder="https://linkedin.com/in/…" />
                </div>
              </Section>

              <Section icon={<IcoPin />} title="Endereço" open={sections.endereco} onToggle={() => toggle('endereco')} sectionId="drw-endereco">
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>CEP</label>
                    <input className={styles.input} value={form.cep}
                      onChange={e => setForm(f => ({ ...f, cep: maskCEP(e.target.value) }))}
                      placeholder="00000-000" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Estado</label>
                    <input className={styles.input} value={form.estado}
                      onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                      placeholder="SP" maxLength={2} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Logradouro</label>
                  <input className={styles.input} value={form.logradouro}
                    onChange={e => setForm(f => ({ ...f, logradouro: e.target.value }))}
                    placeholder="Rua das Flores" />
                </div>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Número</label>
                    <input className={styles.input} value={form.numero}
                      onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="100" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Complemento</label>
                    <input className={styles.input} value={form.complemento}
                      onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Apto 1" />
                  </div>
                </div>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Bairro</label>
                    <input className={styles.input} value={form.bairro}
                      onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Centro" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Cidade</label>
                    <input className={styles.input} value={form.cidade}
                      onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} placeholder="São Paulo" />
                  </div>
                </div>
              </Section>
            </>
          )}
        </form>

        <div className={styles.drawerFoot}>
          {editing && (
            <button type="button" className={styles.btnDanger} onClick={onDelete}>Excluir</button>
          )}
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={saving}
            onClick={onSubmit as unknown as React.MouseEventHandler}
          >
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar funcionário'}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
interface Props {
  initialFuncionarios: Funcionario[];
  initialCargos:       Cargo[];
  initialSetores:      Setor[];
  initialUnidades:     Unidade[];
}

export default function FuncionariosAdmin({ initialFuncionarios, initialCargos, initialSetores, initialUnidades }: Props) {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(initialFuncionarios);
  const [cargos,       setCargos]       = useState<Cargo[]>(initialCargos);
  const [setores,      setSetores]      = useState<Setor[]>(initialSetores);
  const [unidades,     setUnidades]     = useState<Unidade[]>(initialUnidades);
  const [loading,      setLoading]      = useState(false);

  const [search,    setSearch]    = useState('');
  const [fSetor,    setFSetor]    = useState('');
  const [fCargo,    setFCargo]    = useState('');
  const [sortField, setSortField] = useState<'nome' | 'nivel' | 'setor' | 'unidade'>('nome');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<Funcionario | null>(null);
  const [form,       setForm]       = useState<typeof BLANK_FORM>({ ...BLANK_FORM });
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; err: boolean } | null>(null);
  const [confirm,    setConfirm]    = useState<Funcionario | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadFuncionarios = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) invalidateCache(CACHE_KEYS.ADMIN_FUNCS);
    setLoading(true);
    try {
      const data = await cachedFetch<Funcionario[]>(
        CACHE_KEYS.ADMIN_FUNCS,
        () => fetch('/api/admin/funcionarios').then(r => r.json()),
        CACHE_TTL.ADMIN,
      );
      setFuncionarios(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasDeps = cargos.length > 0 && setores.length > 0 && unidades.length > 0;

  const validSetorIds = useMemo(() => new Set(setores.map(s => s.id)), [setores]);
  const semSetorValido = useMemo(
    () => funcionarios.filter(f => f.id_setor && !validSetorIds.has(f.id_setor)),
    [funcionarios, validSetorIds],
  );

  const filtered = useMemo(() => {
    let list = funcionarios;
    if (fSetor === '__none__') list = list.filter(f => f.id_setor && !validSetorIds.has(f.id_setor));
    else if (fSetor) list = list.filter(f => f.id_setor === fSetor);
    if (fCargo) list = list.filter(f => f.id_cargo === fCargo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.nome_completo.toLowerCase().includes(q) ||
        (f.cargo_nome ?? '').toLowerCase().includes(q) ||
        (f.setor_nome ?? '').toLowerCase().includes(q)
      );
    }
    const d = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortField) {
        case 'nivel':   return ((a.cargo_nvl ?? 99) - (b.cargo_nvl ?? 99)) * d;
        case 'setor':   return (a.setor_nome ?? '').localeCompare(b.setor_nome ?? '') * d;
        case 'unidade': return (a.unidade_nome ?? '').localeCompare(b.unidade_nome ?? '') * d;
        default:        return a.nome_completo.localeCompare(b.nome_completo) * d;
      }
    });
  }, [funcionarios, search, fSetor, fCargo, validSetorIds, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK_FORM });
    setDrawerOpen(true);
  }

  function openEdit(f: Funcionario) {
    setEditing(f);
    // Nome individual já está correto no banco — busca co-diretor pelo cargo e setor.
    // Co-diretor só existe para diretores (nvl_permissao === 0); GMs e demais não têm par.
    const mainNome = f.nome_completo;
    const cargoNvl = cargos.find(c => c.id === f.id_cargo)?.nvl_permissao ?? 99;
    const coRecord = cargoNvl === 0
      ? funcionarios.find(
          fn => fn.id_cargo === f.id_cargo && fn.id !== f.id
            && (fn.id_setor === f.id_setor || !fn.id_setor)
        )
      : undefined;
    const coNome   = coRecord?.nome_completo ?? '';

    setForm({
      nome_completo:    mainNome,
      id_cargo:         f.id_cargo,
      id_setor:         validSetorIds.has(f.id_setor) ? f.id_setor : '',
      id_unidade:       f.id_unidade,
      photo_url:        f.photo_url       ?? '',
      cpf:              f.cpf             ?? '',
      rg:               f.rg              ?? '',
      cnpj:             f.cnpj            ?? '',
      contrato_tipo:    (f.contrato_tipo    ?? '') as FuncForm['contrato_tipo'],
      jornada_trabalho: (f.jornada_trabalho ?? '') as FuncForm['jornada_trabalho'],
      data_nascimento:  f.data_nascimento  ?? '',
      data_admissao:    f.data_admissao    ?? '',
      data_desligamento:f.data_desligamento ?? '',
      telefone:         f.telefone         ?? '',
      celular:          f.celular          ?? '',
      homepage:         f.homepage         ?? '',
      logradouro:       f.logradouro       ?? '',
      numero:           f.numero           ?? '',
      complemento:      f.complemento      ?? '',
      bairro:           f.bairro           ?? '',
      cidade:           f.cidade           ?? '',
      estado:           f.estado           ?? '',
      cep:              f.cep              ?? '',
      parent_node_id:   '',
      co_diretor_nome:  coNome,
      co_id:            coRecord?.id ?? '',
      co_cpf:           (coRecord?.cpf             as string | undefined) ?? '',
      co_rg:            (coRecord?.rg              as string | undefined) ?? '',
      co_cnpj:          (coRecord?.cnpj            as string | undefined) ?? '',
      co_contrato_tipo: ((coRecord?.contrato_tipo  as string | undefined) ?? '') as FuncForm['co_contrato_tipo'],
      co_jornada_trabalho: ((coRecord?.jornada_trabalho as string | undefined) ?? '') as FuncForm['co_jornada_trabalho'],
      co_data_nascimento:  (coRecord?.data_nascimento  as string | undefined) ?? '',
      co_data_admissao:    (coRecord?.data_admissao    as string | undefined) ?? '',
      co_data_desligamento:(coRecord?.data_desligamento as string | undefined) ?? '',
      co_telefone:      (coRecord?.telefone   as string | undefined) ?? '',
      co_celular:       (coRecord?.celular    as string | undefined) ?? '',
      co_homepage:      (coRecord?.homepage   as string | undefined) ?? '',
      co_logradouro:    (coRecord?.logradouro as string | undefined) ?? '',
      co_numero:        (coRecord?.numero     as string | undefined) ?? '',
      co_complemento:   (coRecord?.complemento as string | undefined) ?? '',
      co_bairro:        (coRecord?.bairro     as string | undefined) ?? '',
      co_cidade:        (coRecord?.cidade     as string | undefined) ?? '',
      co_estado:        (coRecord?.estado     as string | undefined) ?? '',
      co_cep:           (coRecord?.cep        as string | undefined) ?? '',
    });
    setDrawerOpen(true);
  }

  function closeDrawer() { setDrawerOpen(false); setEditing(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome_completo.trim() || !form.id_cargo || !form.id_unidade) {
      showToast('Preencha: nome, cargo e unidade.', true);
      return;
    }
    if (!form.id_setor || !validSetorIds.has(form.id_setor)) {
      showToast('Selecione um setor válido para o funcionário.', true);
      return;
    }
    setSaving(true);
    try {
      const url    = editing ? `/api/admin/funcionarios/${editing.id}` : '/api/admin/funcionarios';
      const method = editing ? 'PUT' : 'POST';
      const hasCo  = form.co_diretor_nome.trim() !== '';
      // Salva APENAS o nome individual — o frontend une com "&" ao exibir
      const nomeFinal = form.nome_completo.trim();

      const {
        co_diretor_nome: _cn, co_id: _ci,
        co_cpf: _ccpf, co_rg: _crg, co_cnpj: _ccnpj,
        co_contrato_tipo: _cct, co_jornada_trabalho: _cjt,
        co_data_nascimento: _cdn, co_data_admissao: _cda, co_data_desligamento: _cdd,
        co_telefone: _ctel, co_celular: _ccel, co_homepage: _chp,
        co_logradouro: _clg, co_numero: _cnum, co_complemento: _ccomp,
        co_bairro: _cbai, co_cidade: _ccid, co_estado: _cest, co_cep: _ccep,
        ...rest
      } = form;

      const body = { ...rest, nome_completo: nomeFinal, photo_url: form.photo_url,
        contrato_tipo: form.contrato_tipo || null, jornada_trabalho: form.jornada_trabalho || null };

      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? 'Erro ao salvar.', true); return; }

      if (hasCo) {
        const coUrl = form.co_id ? `/api/admin/funcionarios/${form.co_id}` : '/api/admin/funcionarios';
        const coBody = {
          nome_completo: form.co_diretor_nome.trim(),
          id_cargo: form.id_cargo, id_setor: form.id_setor, id_unidade: form.id_unidade,
          // photo_url só é enviado ao CRIAR o co-diretor; em edições (PUT) é omitido
          // para não sobrescrever a foto própria do co-diretor com a do diretor principal.
          ...(form.co_id ? {} : { photo_url: form.photo_url }),
          cpf: form.co_cpf || null, rg: form.co_rg || null,
          cnpj: form.co_cnpj || null, contrato_tipo: form.co_contrato_tipo || null,
          jornada_trabalho: form.co_jornada_trabalho || null,
          data_nascimento: form.co_data_nascimento || null, data_admissao: form.co_data_admissao || null,
          data_desligamento: form.co_data_desligamento || null, telefone: form.co_telefone || null,
          celular: form.co_celular || null, homepage: form.co_homepage || null,
          logradouro: form.co_logradouro || null, numero: form.co_numero || null,
          complemento: form.co_complemento || null, bairro: form.co_bairro || null,
          cidade: form.co_cidade || null, estado: form.co_estado || null, cep: form.co_cep || null,
          // Não usa skip_org_node: o co-diretor recebe nó próprio (level 0) para que
          // o OrgChart detecte dois nós raiz e os mescle num único CenterCard com "&"
        };
        const coRes = await fetch(coUrl, { method: form.co_id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coBody) });
        if (!coRes.ok) {
          const coJson = await coRes.json();
          showToast(`Diretor salvo, mas erro no co-diretor: ${coJson.error ?? 'desconhecido'}`, true);
          invalidateCachePrefix('org:');
          closeDrawer(); await loadFuncionarios(true); return;
        }
      }

      showToast(editing ? 'Funcionário atualizado.' : 'Funcionário cadastrado no organograma.');
      invalidateCachePrefix('org:');
      closeDrawer();
      await loadFuncionarios(true);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(f: Funcionario) {
    setConfirm(null);
    const res  = await fetch(`/api/admin/funcionarios/${f.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? 'Erro ao excluir.', true); return; }
    showToast('Funcionário removido do sistema e do organograma.');
    invalidateCachePrefix('org:');
    closeDrawer();
    await loadFuncionarios(true);
  }

  // Estatísticas
  const totalAtivos = funcionarios.filter(f => validSetorIds.has(f.id_setor)).length;

  return (
    <div className={styles.page}>

      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <span>Funcionários</span>
        </div>
        <h1 className={styles.headerTitle}>Funcionários</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={styles.headerBadge}>{funcionarios.length} total</span>
          {semSetorValido.length > 0 && (
            <span className={styles.headerBadge} style={{ background: 'rgba(251,146,60,.10)', color: '#fb923c', borderColor: 'rgba(251,146,60,.22)' }}>
              {semSetorValido.length} sem setor
            </span>
          )}
        </div>
      </div>

      <div className={styles.funcLayout}>

        {/* Aviso de pré-requisitos */}
        {!loading && !hasDeps && (
          <div className={styles.depWarning} style={{ margin: '12px 20px 0' }}>
            <span className={styles.depWarningIcon}><IcoWarn /></span>
            <span>
              Para cadastrar funcionários é necessário ter pelo menos um{' '}
              <Link href="/admin/cargos" style={{ color: 'inherit', textDecoration: 'underline' }}>Cargo</Link>,{' '}
              <Link href="/admin/setores" style={{ color: 'inherit', textDecoration: 'underline' }}>Setor</Link> e{' '}
              <Link href="/admin/unidades/cadastro" style={{ color: 'inherit', textDecoration: 'underline' }}>Unidade</Link> cadastrados.
            </span>
          </div>
        )}

        {/* Aviso de setor excluído */}
        {!loading && semSetorValido.length > 0 && (
          <div className={styles.sectorWarn} style={{ margin: '12px 20px 0' }}>
            <span className={styles.sectorWarnIcon}><IcoWarn /></span>
            <span>
              <strong>{semSetorValido.length} funcionário{semSetorValido.length > 1 ? 's' : ''}</strong> com setor excluído.
              Estão ocultos no organograma até serem realocados.{' '}
              <button className={styles.sectorWarnBtn} onClick={() => setFSetor('__none__')}>
                Ver pendentes
              </button>
            </span>
          </div>
        )}

        {/* Barra de busca e filtros */}
        <div className={styles.listHeader}>
          <div className={styles.statsChip}>
            <span className={styles.statsNum}>{filtered.length}</span>
            <span className={styles.statsLabel}>funcionários</span>
          </div>

          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><IcoSearch /></span>
            <input
              className={styles.searchInput}
              placeholder="Buscar por nome, cargo ou setor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-faint)', display: 'flex', padding: 2,
                  borderRadius: 4, transition: 'color .12s',
                }}
              >
                <IcoX />
              </button>
            )}
          </div>

          <select className={styles.filterSelect} value={fSetor} onChange={e => setFSetor(e.target.value)}>
            <option value="">Todos os setores</option>
            {semSetorValido.length > 0 && (
              <option value="__none__">Sem setor válido ({semSetorValido.length})</option>
            )}
            {setores.filter(s => s.ativo).map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>

          <select className={styles.filterSelect} value={fCargo} onChange={e => setFCargo(e.target.value)}>
            <option value="">Todos os cargos</option>
            {cargos.filter(c => c.ativo).map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>

          <button className={styles.addBtn} onClick={openNew} disabled={!hasDeps}>
            <IcoPlus /> Novo funcionário
          </button>
        </div>

        {/* Cabeçalho da tabela — clique na coluna para ordenar */}
        <div className={styles.tableHead}>
          {([ ['nome', 'Funcionário'], ['nivel', 'Cargo'], ['setor', 'Setor'], ['unidade', 'Unidade'] ] as const).map(([field, label]) => (
            <button
              key={field}
              type="button"
              className={styles.tableHeadCell}
              onClick={() => toggleSort(field)}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 3, color: sortField === field ? 'var(--text-secondary)' : undefined }}
            >
              {label}
              <span style={{ fontSize: 9, opacity: sortField === field ? 1 : 0.25, lineHeight: 1 }}>
                {sortDir === 'asc' ? '▲' : '▼'}
              </span>
            </button>
          ))}
          <span className={styles.tableHeadCell}>Contrato</span>
          <span className={styles.tableHeadCell}></span>
        </div>

        {/* Tabela */}
        <div className={styles.funcTable}>
          {loading ? (
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className={styles.tableRow} style={{ opacity: .5, cursor: 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={styles.skeleton} style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span className={styles.skeleton} style={{ width: 140, height: 13 }} />
                      <span className={styles.skeleton} style={{ width: 90, height: 10 }} />
                    </div>
                  </div>
                  <span className={styles.skeleton} style={{ width: '70%', height: 12 }} />
                  <span className={styles.skeleton} style={{ width: '60%', height: 12 }} />
                  <span className={styles.skeleton} style={{ width: '55%', height: 12 }} />
                  <span className={styles.skeleton} style={{ width: 44, height: 20, borderRadius: 4 }} />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} style={{ color: 'var(--text-faint)' }}>
                <IcoUsers />
              </div>
              <p className={styles.emptyTitle}>
                {search || fSetor || fCargo
                  ? 'Nenhum resultado encontrado'
                  : hasDeps
                    ? 'Nenhum funcionário cadastrado'
                    : 'Cadastre os pré-requisitos primeiro'}
              </p>
              <p className={styles.emptyText}>
                {search || fSetor || fCargo
                  ? 'Tente ajustar os filtros ou termos de busca.'
                  : hasDeps
                    ? 'Adicione o primeiro funcionário para ele aparecer no organograma.'
                    : 'Cargos, Setores e Unidades precisam existir antes de cadastrar funcionários.'}
              </p>
              {hasDeps && !search && !fSetor && !fCargo && (
                <button className={styles.btnPrimary} style={{ marginTop: 8, maxWidth: 200, flex: 'none' }} onClick={openNew}>
                  + Novo funcionário
                </button>
              )}
              {(search || fSetor || fCargo) && (
                <button
                  className={styles.btnSecondary}
                  style={{ marginTop: 8, maxWidth: 200 }}
                  onClick={() => { setSearch(''); setFSetor(''); setFCargo(''); }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            filtered.map(f => {
              const nvl          = f.cargo_nvl ?? 9;
              const color        = levelColors[nvl] ?? '#94a3b8';
              const setorInvalido = f.id_setor && !validSetorIds.has(f.id_setor);
              return (
                <div
                  key={f.id}
                  className={`${styles.tableRow} ${setorInvalido ? styles.tableRowWarn : ''}`}
                  onClick={() => openEdit(f)}
                >
                  {/* Coluna: Funcionário (avatar + nome + nível) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar photoUrl={f.photo_url ?? ''} name={f.nome_completo} size={34} color={color} />
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.cellName}>{f.nome_completo}</div>
                      {f.cargo_nvl !== undefined && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                          background: `${color}18`, color, border: `1px solid ${color}28`,
                          letterSpacing: '.04em',
                        }}>
                          Nv {f.cargo_nvl}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cargo */}
                  <span className={styles.cellSub} style={{ fontSize: 12.5 }}>{f.cargo_nome ?? '—'}</span>

                  {/* Setor */}
                  <div>
                    {setorInvalido ? (
                      <span className={styles.sectorWarnBadge}><IcoWarn /> Setor excluído</span>
                    ) : (
                      <span className={styles.cellSub} style={{ fontSize: 12.5 }}>{f.setor_nome ?? '—'}</span>
                    )}
                  </div>

                  {/* Unidade */}
                  <span className={styles.cellSub} style={{ fontSize: 12.5 }}>{f.unidade_nome ?? '—'}</span>

                  {/* Contrato */}
                  <span>
                    {f.contrato_tipo ? (
                      <span className={styles.lvlBadge} style={
                        f.contrato_tipo === 'PJ'
                          ? { background: 'rgba(168,85,247,.12)', color: '#c4b5fd', border: '1px solid rgba(168,85,247,.22)' }
                          : f.contrato_tipo === 'Freelancer'
                            ? { background: 'rgba(251,191,36,.10)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.22)' }
                            : { background: 'rgba(52,211,153,.10)', color: '#34d399', border: '1px solid rgba(52,211,153,.22)' }
                      }>
                        {f.contrato_tipo}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>
                    )}
                  </span>

                  {/* Ações */}
                  <div className={styles.cellActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} aria-label={`Editar ${f.nome_completo}`} onClick={() => openEdit(f)}><IcoEdit /></button>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} aria-label={`Excluir ${f.nome_completo}`} onClick={() => setConfirm(f)}><IcoTrash /></button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <FuncionarioDrawer
          form={form} setForm={setForm}
          editing={editing} cargos={cargos} setores={setores}
          unidades={unidades} funcionarios={funcionarios}
          saving={saving} onClose={closeDrawer}
          onSubmit={handleSubmit}
          onDelete={() => editing && setConfirm(editing)}
        />
      )}

      {/* Toast */}
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

      {/* Modal de confirmação */}
      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)} aria-hidden="false">
          <div
            className={styles.confirmModal}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-func-title"
          >
            <div className={styles.confirmIcon} style={{ color: 'var(--danger)' }} aria-hidden="true"><IcoTrash /></div>
            <p className={styles.confirmTitle} id="confirm-func-title">Excluir funcionário</p>
            <p className={styles.confirmMsg}>
              Remover <strong>{confirm.nome_completo}</strong>?<br />
              O nó correspondente no organograma também será removido.
            </p>
            <div className={styles.confirmFoot}>
              <button className={styles.btnSecondary} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => confirmDelete(confirm)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
