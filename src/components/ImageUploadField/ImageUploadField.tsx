'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FilerobotImageEditorConfig } from 'react-filerobot-image-editor';
import styles from './ImageUploadField.module.css';

// Usa canvas/DOM do navegador — nunca renderiza no servidor. Importante: NÃO
// importar nada além de tipos de 'react-filerobot-image-editor' no topo do
// módulo — o pacote arrasta o konva, que exige o binário nativo `canvas` ao
// ser avaliado durante o SSR do componente cliente. Por isso os IDs de
// tab/tool abaixo são strings literais, não os enums TABS/TOOLS do pacote.
const FilerobotImageEditor = dynamic(() => import('react-filerobot-image-editor'), { ssr: false });
const ADJUST_TAB = 'Adjust' as const;
const CROP_TOOL = 'Crop' as const;

const ALLOWED_TYPES = 'image/png,image/jpeg,image/webp';

interface Props {
  /** URL atual da imagem (proxy /api/fotos, URL pública do SeaweedFS, ou vazio). */
  value: string;
  onChange: (url: string) => void;
  /** Rota de upload: '/api/admin/upload/pessoas' ou '/api/admin/upload/historia'. */
  uploadEndpoint: string;
  /** Proporção travada no recorte (1 = quadrado, 16/9 etc). Omitido = recorte livre. */
  aspectRatio?: number;
  shape?: 'circle' | 'rect';
  label?: string;
  hint?: string;
  /** Dimensões mínimas recomendadas em px — mostradas como dica e aplicadas como limite no recorte. */
  recommendedSize?: { width: number; height: number };
}

export default function ImageUploadField({
  value, onChange, uploadEndpoint, aspectRatio, shape = 'rect', label, hint, recommendedSize,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;
    setError(null);
    setSizeWarning(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (recommendedSize) {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth < recommendedSize.width || img.naturalHeight < recommendedSize.height) {
            setSizeWarning(
              `Essa imagem tem ${img.naturalWidth}×${img.naturalHeight}px, menor que o recomendado (${recommendedSize.width}×${recommendedSize.height}px) — pode ficar borrada ao ampliar.`,
            );
          }
        };
        img.src = dataUrl;
      }
      setEditingSrc(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  const handleSave: NonNullable<FilerobotImageEditorConfig['onSave']> = async (savedImageData) => {
    setEditingSrc(null);
    if (!savedImageData.imageBase64) return;
    setUploading(true);
    setError(null);
    try {
      // Não usar fetch() numa data: URL — o CSP (connect-src) do app bloqueia
      // esse esquema. Decodifica o base64 manualmente em vez disso.
      const [meta, base64] = savedImageData.imageBase64.split(',');
      const mimeMatch = meta.match(/data:(.*);base64/);
      const mimeType = mimeMatch?.[1] || 'image/webp';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, `image.${savedImageData.extension || 'webp'}`);
      const res = await fetch(uploadEndpoint, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erro ao enviar imagem.'); return; }
      onChange(json.url);
    } catch {
      setError('Falha de conexão ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.row}>
        {value && (
          <img
            src={value}
            alt=""
            className={shape === 'circle' ? styles.previewCircle : styles.previewRect}
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Enviando…' : value ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {value && (
            <button type="button" className={styles.btnGhost} onClick={() => onChange('')} disabled={uploading}>
              Remover
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES} hidden onChange={onPickFile} />
      </div>
      {error && <span className={styles.error}>{error}</span>}
      {sizeWarning && <span className={styles.warning}>{sizeWarning}</span>}
      {recommendedSize && (
        <span className={styles.hint}>
          Tamanho recomendado: {recommendedSize.width}×{recommendedSize.height}px
          {shape === 'circle' ? ' (quadrada — fica recortada em círculo)' : ''}.
        </span>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}

      {editingSrc && (
        <div className={styles.editorOverlay}>
          <FilerobotImageEditor
            source={editingSrc}
            onSave={handleSave}
            onClose={() => setEditingSrc(null)}
            closeAfterSave
            Crop={aspectRatio ? { ratio: aspectRatio, noPresets: true } : { ratio: 'original' }}
            tabsIds={[ADJUST_TAB]}
            defaultTabId={ADJUST_TAB}
            defaultToolId={CROP_TOOL}
            defaultSavedImageType="webp"
            defaultSavedImageQuality={0.9}
            avoidChangesNotSavedAlertOnLeave
            language="pt"
            savingPixelRatio={1}
            previewPixelRatio={1}
          />
        </div>
      )}
    </div>
  );
}
