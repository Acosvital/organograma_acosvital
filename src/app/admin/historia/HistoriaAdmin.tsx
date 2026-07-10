'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IcoPlus, IcoTrash } from '../_icons';
import { invalidateCache, CACHE_KEYS } from '@/lib/dataCache';
import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import type { HistoriaContent, HistoriaImagem, HistoriaTimelineItem } from '@/types/historia';
import styles from '../crud.module.css';

function emptyImagem(): HistoriaImagem {
  return { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, url: '', legenda: '' };
}

function emptyTimelineItem(): HistoriaTimelineItem {
  return { id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ano: new Date().getFullYear(), titulo: '', descricao: '', imagemUrl: null };
}

export default function HistoriaAdmin() {
  const [titulo,   setTitulo]   = useState('');
  const [texto,    setTexto]    = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imagens,  setImagens]  = useState<HistoriaImagem[]>([]);
  const [timeline, setTimeline] = useState<HistoriaTimelineItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; err: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/historia')
      .then(r => {
        if (!r.ok) throw new Error('Falha ao carregar história.');
        return r.json();
      })
      .then((data: HistoriaContent) => {
        setTitulo(data.titulo ?? '');
        setTexto(data.texto ?? '');
        setVideoUrl(data.videoUrl ?? '');
        setImagens(data.imagens?.length ? data.imagens : []);
        setTimeline(data.timeline?.length ? data.timeline : []);
      })
      .catch(() => setToast({ msg: 'Não foi possível carregar o conteúdo.', err: true }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function updateImagem(id: string, patch: Partial<HistoriaImagem>) {
    setImagens(imgs => imgs.map(img => img.id === id ? { ...img, ...patch } : img));
  }

  function removeImagem(id: string) {
    setImagens(imgs => imgs.filter(img => img.id !== id));
  }

  function updateTimelineItem(id: string, patch: Partial<HistoriaTimelineItem>) {
    setTimeline(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function removeTimelineItem(id: string) {
    setTimeline(items => items.filter(item => item.id !== id));
  }

  const videoInvalid = videoUrl.trim() !== '' && !toVideoEmbedUrl(videoUrl);

  async function handleSave() {
    if (!titulo.trim()) {
      setToast({ msg: 'O título é obrigatório.', err: true });
      return;
    }
    if (videoInvalid) {
      setToast({ msg: 'Link de vídeo inválido. Use um link do YouTube ou Vimeo.', err: true });
      return;
    }
    const invalidTimelineItem = timeline.find(item => !item.titulo.trim() || !Number.isInteger(item.ano) || item.ano <= 1000 || item.ano >= 3000);
    if (invalidTimelineItem) {
      setToast({ msg: 'Verifique os marcos da linha do tempo: ano e título são obrigatórios.', err: true });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/historia', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          titulo,
          texto,
          videoUrl,
          imagens:  imagens.filter(img => img.url.trim()),
          timeline: timeline.map(item => ({ ...item, titulo: item.titulo.trim() })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ msg: json.error ?? 'Erro ao salvar.', err: true });
        return;
      }
      invalidateCache(CACHE_KEYS.HISTORIA);
      setImagens(json.imagens ?? []);
      setTimeline(json.timeline ?? []);
      setToast({ msg: 'Conteúdo salvo com sucesso.', err: false });
    } catch {
      setToast({ msg: 'Falha de conexão ao salvar.', err: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          <span className={styles.breadcrumbSep}>›</span>
          <span>História da Empresa</span>
        </div>
        <h1 className={styles.headerTitle}>História da Empresa</h1>
        <Link href="/historia" target="_blank" className={styles.btnSecondary}>
          Ver página
        </Link>
      </div>

      <div className={styles.formBody} style={{ maxWidth: 720, width: '100%', margin: '0 auto', overflowY: 'auto' }}>
        {loading ? (
          <p className={styles.fieldHint}>Carregando…</p>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Título<span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Nossa História"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Texto</label>
              <textarea
                className={styles.textarea}
                style={{ minHeight: 220 }}
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Conte a história da empresa. Separe parágrafos com uma linha em branco."
              />
              <span className={styles.fieldHint}>Separe parágrafos deixando uma linha em branco entre eles.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Link do vídeo (YouTube ou Vimeo)</label>
              <input
                className={`${styles.input} ${videoInvalid ? styles.inputError : ''}`}
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              {videoInvalid
                ? <span className={styles.fieldError}>Link não reconhecido. Use um link do YouTube ou Vimeo.</span>
                : <span className={styles.fieldHint}>Deixe em branco para não exibir vídeo.</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Imagens</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {imagens.map(img => (
                  <div key={img.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {img.url && (
                      <img
                        src={img.url}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }}
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <input
                        className={styles.input}
                        value={img.url}
                        onChange={e => updateImagem(img.id, { url: e.target.value })}
                        placeholder="https://…"
                      />
                      <input
                        className={styles.input}
                        value={img.legenda}
                        onChange={e => updateImagem(img.id, { legenda: e.target.value })}
                        placeholder="Legenda (opcional)"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => removeImagem(img.id)}
                      title="Remover imagem"
                      style={{ flexShrink: 0 }}
                    >
                      <IcoTrash />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setImagens(imgs => [...imgs, emptyImagem()])}
                >
                  <IcoPlus /> Adicionar imagem
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Linha do tempo</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {timeline.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 8,
                  }}>
                    <input
                      className={styles.input}
                      style={{ maxWidth: 84, flexShrink: 0 }}
                      value={item.ano}
                      onChange={e => updateTimelineItem(item.id, { ano: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      placeholder="Ano"
                      inputMode="numeric"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <input
                        className={styles.input}
                        value={item.titulo}
                        onChange={e => updateTimelineItem(item.id, { titulo: e.target.value })}
                        placeholder="Título do marco"
                      />
                      <textarea
                        className={styles.textarea}
                        style={{ minHeight: 50 }}
                        value={item.descricao}
                        onChange={e => updateTimelineItem(item.id, { descricao: e.target.value })}
                        placeholder="Descrição (opcional)"
                      />
                      <input
                        className={styles.input}
                        value={item.imagemUrl ?? ''}
                        onChange={e => updateTimelineItem(item.id, { imagemUrl: e.target.value || null })}
                        placeholder="URL da imagem (opcional)"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => removeTimelineItem(item.id)}
                      title="Remover marco"
                      style={{ flexShrink: 0 }}
                    >
                      <IcoTrash />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setTimeline(items => [...items, emptyTimelineItem()])}
                >
                  <IcoPlus /> Adicionar marco
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.formFoot} style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <button className={styles.btnPrimary} disabled={saving || loading} onClick={handleSave}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
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
    </div>
  );
}
