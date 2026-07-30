'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { IcoSearch, IcoX, IcoMapPin, IcoWarn, IcoEmpty } from '../_icons';
import styles from '../crud.module.css';

export interface Cliente {
  codigo_parceiro_omie: string;
  nome_fantasia:        string;
  email:                string | null;
  telefone:             string | null;
  logradouro:           string | null;
  numero:               string | null;
  complemento:          string | null;
  bairro:               string | null;
  cidade:               string | null;
  estado:               string | null;
  cep:                  string | null;
  latitude_y:           number | null;
  longitude_x:          number | null;
}

interface ApiResponse {
  clientes: Cliente[];
  total:    number;
  page:     number;
  pages:    number;
}

function buildAddress(c: Cliente): string {
  return [
    c.logradouro && c.numero ? `${c.logradouro}, ${c.numero}` : c.logradouro,
    c.complemento,
    c.bairro,
    c.cidade && c.estado ? `${c.cidade} – ${c.estado}` : c.cidade ?? c.estado,
    c.cep,
  ].filter(Boolean).join(', ');
}

const LIMIT = 50;

interface Props {
  initialClientes: Cliente[];
  initialTotal:    number;
  initialPage:     number;
  initialPages:    number;
}

export default function ClientesAdmin({ initialClientes, initialTotal, initialPage, initialPages }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [total,    setTotal]    = useState(initialTotal);
  const [page,     setPage]     = useState(initialPage);
  const [pages,    setPages]    = useState(initialPages);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<Cliente | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, page: String(p), limit: String(LIMIT) });
      const res  = await fetch(`/api/admin/clientes?${params}`);
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Erro ${res.status}`);
        setClientes([]);
        return;
      }
      setClientes(json.clientes ?? []);
      setTotal(json.total    ?? 0);
      setPage(json.page      ?? 1);
      setPages(json.pages    ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar clientes.');
      setClientes([]);
    } finally { setLoading(false); }
  }, []);

  function handleSearch(value: string) {
    setSearch(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { load(value, 1); }, 350);
  }

  function goPage(p: number) { load(search, p); }

  function toggleSelected(c: Cliente) {
    setSelected(prev => prev?.codigo_parceiro_omie === c.codigo_parceiro_omie ? null : c);
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <span>Clientes</span>
        </div>
        <h1 className={styles.headerTitle}>Clientes</h1>
        {!loading && (
          <span className={styles.headerBadge}>{total} registro{total !== 1 ? 's' : ''}</span>
        )}

        {/* Busca no header — só nessa página faz sentido */}
        <div className={styles.searchWrap} style={{ maxWidth: 300, marginLeft: 'auto' }}>
          <span className={styles.searchIcon}><IcoSearch /></span>
          <input
            className={styles.searchInput}
            placeholder="Nome, código, cidade…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearch('')}
              aria-label="Limpar busca"
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-faint)', display: 'flex', padding: 2, borderRadius: 4,
              }}
            >
              <IcoX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Tabela */}
        <div className={styles.listPanel} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Cabeçalho das colunas */}
          <div className={styles.clHead}>
            <div>Cód. Omie</div>
            <div>Nome Fantasia</div>
            <div>Cidade / UF</div>
            <div>E-mail</div>
            <div>Telefone</div>
            <div />
          </div>

          <div className={styles.list}>
            {loading && (
              <div style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className={styles.skeleton} style={{ height: 38, borderRadius: 6 }} />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className={styles.empty}>
                <div className={styles.emptyIcon} style={{ color: 'var(--danger)', opacity: 1 }}>
                  <IcoWarn size={44} />
                </div>
                <div className={styles.emptyTitle}>Erro ao carregar clientes</div>
                <div className={styles.emptyText}>{error}</div>
                <button className={styles.btnSecondary} style={{ marginTop: 12 }} onClick={() => load(search, page)}>
                  Tentar novamente
                </button>
              </div>
            )}

            {!loading && !error && clientes.length === 0 && (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><IcoEmpty /></div>
                <div className={styles.emptyTitle}>
                  {search ? 'Nenhum resultado encontrado' : 'Nenhum cliente cadastrado'}
                </div>
                <div className={styles.emptyText}>
                  {search ? 'Tente um termo diferente.' : 'Os dados vêm da integração com o Omie.'}
                </div>
                {search && (
                  <button className={styles.btnSecondary} style={{ marginTop: 8 }} onClick={() => handleSearch('')}>
                    Limpar busca
                  </button>
                )}
              </div>
            )}

            {!loading && !error && clientes.map(c => (
              <div
                key={c.codigo_parceiro_omie}
                className={`${styles.clRow} ${selected?.codigo_parceiro_omie === c.codigo_parceiro_omie ? styles.clRowActive : ''}`}
                onClick={() => toggleSelected(c)}
              >
                <div className={styles.clCell}>
                  <span className={styles.codeBadge}>{c.codigo_parceiro_omie}</span>
                </div>
                <div className={styles.clCell}>
                  <span className={styles.rowName}>{c.nome_fantasia || '—'}</span>
                </div>
                <div className={styles.clCell}>
                  <span className={styles.rowSub}>
                    {[c.cidade, c.estado].filter(Boolean).join(' – ') || '—'}
                  </span>
                </div>
                <div className={styles.clCell}>
                  <span className={styles.rowSub}>{c.email || '—'}</span>
                </div>
                <div className={styles.clCell}>
                  <span className={styles.rowSub}>{c.telefone || '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.latitude_y && c.longitude_x && (
                    <span title="Com coordenadas" style={{ color: '#10b981', opacity: 0.8 }}>
                      <IcoMapPin size={12} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Paginação */}
          {pages > 1 && !loading && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>
                ← Anterior
              </button>
              <span className={styles.pageInfo}>Página {page} de {pages}</span>
              <button className={styles.pageBtn} disabled={page >= pages} onClick={() => goPage(page + 1)}>
                Próxima →
              </button>
            </div>
          )}
        </div>

        {/* Painel de detalhe */}
        {selected && (
          <div className={styles.detailPanel}>
            {/* Faixa verde (cliente com geo) ou azul */}
            <div style={{
              height: 3, flexShrink: 0,
              background: (selected.latitude_y && selected.longitude_x)
                ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                : 'linear-gradient(90deg, #3b82f6, #6366f1)',
            }} />

            <div className={styles.drawerHead}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.drawerTitle}>{selected.nome_fantasia || '—'}</div>
                <div className={styles.drawerSubtitle}>Código Omie: {selected.codigo_parceiro_omie}</div>
              </div>
              <button className={styles.drawerClose} onClick={() => setSelected(null)} aria-label="Fechar detalhes">
                <IcoX size={13} />
              </button>
            </div>

            <div className={styles.drawerBody}>

              <div className={styles.detailGroup}>
                <div className={styles.detailGroupTitle}>Contato</div>
                <div className={styles.detailItem}>
                  <span className={styles.detailKey}>E-mail</span>
                  <span className={styles.detailVal}>{selected.email || '—'}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailKey}>Telefone</span>
                  <span className={styles.detailVal}>{selected.telefone || '—'}</span>
                </div>
              </div>

              <div className={styles.detailGroup}>
                <div className={styles.detailGroupTitle}>Endereço</div>
                {buildAddress(selected) ? (
                  <p className={styles.detailAddr}>{buildAddress(selected)}</p>
                ) : (
                  <p className={styles.detailAddr} style={{ color: 'var(--text-muted)' }}>Não informado.</p>
                )}
                <div className={styles.row2} style={{ marginTop: 8 }}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailKey}>CEP</span>
                    <span className={styles.detailVal}>{selected.cep || '—'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailKey}>UF</span>
                    <span className={styles.detailVal}>{selected.estado || '—'}</span>
                  </div>
                </div>
              </div>

              {(selected.latitude_y != null && selected.longitude_x != null &&
                !isNaN(Number(selected.latitude_y)) && !isNaN(Number(selected.longitude_x))) && (
                <div className={styles.detailGroup}>
                  <div className={styles.detailGroupTitle}>Localização</div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailKey}>Lat / Lon</span>
                    <span className={styles.detailVal} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                      {Number(selected.latitude_y).toFixed(5)}, {Number(selected.longitude_x).toFixed(5)}
                    </span>
                  </div>
                </div>
              )}

              <div className={styles.infoNotice}>
                Cadastro de clientes gerenciado via integração Omie. Dados somente leitura.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
