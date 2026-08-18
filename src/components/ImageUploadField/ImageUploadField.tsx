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
// Mantido em espelho ao limite do servidor (rotas /api/admin/upload/*) — falha
// cedo no navegador em vez de deixar o usuário esperar um upload de um
// arquivo enorme só para ser rejeitado depois.
const MAX_SIZE = 8 * 1024 * 1024;

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
  /** Notifica o formulário pai enquanto um upload está em andamento, para que
   *  o botão de salvar do formulário possa esperar em vez de persistir o
   *  registro com a URL antiga enquanto a nova imagem ainda está subindo. */
  onUploadingChange?: (uploading: boolean) => void;
}

export default function ImageUploadField({
  value, onChange, uploadEndpoint, aspectRatio, shape = 'rect', label, hint, recommendedSize, onUploadingChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  // Guarda o blob já recortado para permitir retry sem reabrir o editor —
  // e ignorar callbacks de decodificação de imagem de uma seleção anterior.
  const pendingUploadRef = useRef<{ blob: Blob; ext: string } | null>(null);
  const pickTokenRef = useRef(0);

  function setUploadingState(u: boolean) {
    setUploading(u);
    onUploadingChange?.(u);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;
    setError(null);
    setSizeWarning(null);
    setCanRetry(false);
    pendingUploadRef.current = null;

    if (file.size > MAX_SIZE) {
      setError('Imagem muito grande (máx. 8MB).');
      return;
    }

    const token = ++pickTokenRef.current;
    const reader = new FileReader();
    reader.onerror = () => {
      if (pickTokenRef.current !== token) return;
      setError('Não foi possível ler o arquivo selecionado.');
    };
    reader.onload = () => {
      if (pickTokenRef.current !== token) return; // usuário já escolheu outro arquivo
      const dataUrl = reader.result as string;
      if (recommendedSize) {
        const img = new Image();
        img.onload = () => {
          if (pickTokenRef.current !== token) return; // ignora decode obsoleto de seleção anterior
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

  async function doUpload() {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    const oldValue = value;
    setUploadingState(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', pending.blob, `image.${pending.ext}`);
      const res = await fetch(uploadEndpoint, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Erro ao enviar imagem.');
        setCanRetry(true);
        return;
      }
      pendingUploadRef.current = null;
      setCanRetry(false);
      onChange(json.url);
      if (oldValue) {
        // Best-effort: limpa o objeto antigo no S3. Falha aqui não deve
        // bloquear a troca de imagem no formulário.
        fetch(uploadEndpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: oldValue }),
        }).catch(() => {});
      }
    } catch {
      setError('Falha de conexão ao enviar imagem.');
      setCanRetry(true);
    } finally {
      setUploadingState(false);
    }
  }

  const handleSave: NonNullable<FilerobotImageEditorConfig['onSave']> = async (savedImageData) => {
    setEditingSrc(null);
    if (!savedImageData.imageBase64) return;
    // Não usar fetch() numa data: URL — o CSP (connect-src) do app bloqueia
    // esse esquema. Decodifica o base64 manualmente em vez disso.
    const [meta, base64] = savedImageData.imageBase64.split(',');
    const mimeMatch = meta.match(/data:(.*);base64/);
    const mimeType = mimeMatch?.[1] || 'image/webp';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // Guarda o blob recortado ANTES de tentar o upload — se a rede falhar, o
    // usuário só clica "Tentar novamente", sem precisar refazer o recorte.
    pendingUploadRef.current = { blob: new Blob([bytes], { type: mimeType }), ext: savedImageData.extension || 'webp' };
    await doUpload();
  };

  async function handleRemove() {
    const oldValue = value;
    onChange('');
    pendingUploadRef.current = null;
    setCanRetry(false);
    setError(null);
    if (oldValue) {
      fetch(uploadEndpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: oldValue }),
      }).catch(() => {});
    }
  }

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
            <button type="button" className={styles.btnGhost} onClick={handleRemove} disabled={uploading}>
              Remover
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES} hidden onChange={onPickFile} />
      </div>
      {error && (
        <span className={styles.error}>
          {error}
          {canRetry && (
            <button type="button" className={styles.btnGhost} onClick={doUpload} disabled={uploading}>
              Tentar novamente
            </button>
          )}
        </span>
      )}
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
