'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IcoPlus, IcoTrash } from '../_icons';
import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import ImageUploadField from '@/components/ImageUploadField/ImageUploadField';
import type { HistoriaContent, HistoriaTimelineItem } from '@/types/historia';
import styles from '../crud.module.css';

const HISTORIA_UPLOAD_ENDPOINT = '/api/admin/upload/historia';

function emptyTimelineItem(): HistoriaTimelineItem {
  return { id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ano: new Date().getFullYear(), titulo: '', descricao: '', imagemUrl: null };
}

interface Props {
  initialHistoria: HistoriaContent | null;
}

export default function HistoriaAdmin({ initialHistoria }: Props) {
  const [titulo,             setTitulo]             = useState(initialHistoria?.titulo ?? '');
  const [texto,              setTexto]              = useState(initialHistoria?.texto ?? '');
  const [videoUrl,           setVideoUrl]           = useState(initialHistoria?.videoUrl ?? '');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(initialHistoria?.backgroundImageUrl ?? '');
  const [timeline,           setTimeline]           = useState<HistoriaTimelineItem[]>(initialHistoria?.timeline ?? []);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; err: boolean } | null>(
    initialHistoria ? null : { msg: 'Não foi possível carregar o conteúdo.', err: true },
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
          backgroundImageUrl: backgroundImageUrl.trim(),
          timeline: timeline.map(item => ({ ...item, titulo: item.titulo.trim() })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ msg: json.error ?? 'Erro ao salvar.', err: true });
        return;
      }
      setBackgroundImageUrl(json.backgroundImageUrl ?? '');
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
              <ImageUploadField
                label="Imagem de fundo"
                value={backgroundImageUrl}
                onChange={setBackgroundImageUrl}
                uploadEndpoint={HISTORIA_UPLOAD_ENDPOINT}
                recommendedSize={{ width: 1920, height: 1080 }}
                hint="Aparece por trás do texto na tela pública, com um gradiente escuro por cima para manter a leitura. Deixe em branco para usar só o fundo padrão."
              />
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
                      <ImageUploadField
                        value={item.imagemUrl ?? ''}
                        onChange={url => updateTimelineItem(item.id, { imagemUrl: url || null })}
                        uploadEndpoint={HISTORIA_UPLOAD_ENDPOINT}
                        aspectRatio={16 / 9}
                        recommendedSize={{ width: 800, height: 450 }}
                        hint="Imagem opcional do marco."
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
      </div>

      <div className={styles.formFoot} style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <button className={styles.btnPrimary} disabled={saving} onClick={handleSave}>
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
