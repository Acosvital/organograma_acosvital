import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import type { HistoriaContent } from '@/types/historia';
import styles from './HistoriaView.module.css';

interface Props {
  historia: HistoriaContent | null;
  error?: boolean;
}

export default function HistoriaView({ historia, error = false }: Props) {
  const embedUrl = historia?.videoUrl ? toVideoEmbedUrl(historia.videoUrl) : null;
  const paragraphs = historia?.texto.split(/\n\s*\n/).filter(p => p.trim()) ?? [];
  const timeline = historia?.timeline ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        {error && (
          <p className={styles.status}>Não foi possível carregar esta página.</p>
        )}

        {!error && historia && (
          <>
            <h1 className={styles.title}>{historia.titulo}</h1>

            {paragraphs.length === 0 && historia.imagens.length === 0 && !embedUrl && timeline.length === 0 ? (
              <p className={styles.status}>Conteúdo ainda não cadastrado.</p>
            ) : (
              <>
                {paragraphs.length > 0 && (
                  <div className={styles.text}>
                    {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                )}

                {timeline.length > 0 && (
                  <div className={styles.timeline}>
                    {timeline.map(item => (
                      <div key={item.id} className={styles.timelineItem}>
                        <div className={styles.timelineMarker}>
                          <span className={styles.timelineYear}>{item.ano}</span>
                          <span className={styles.timelineDot} />
                        </div>
                        <div className={styles.timelineBody}>
                          {item.imagemUrl && (
                            <img src={item.imagemUrl} alt="" className={styles.timelineImg} loading="lazy" />
                          )}
                          <h3 className={styles.timelineTitle}>{item.titulo}</h3>
                          {item.descricao && <p className={styles.timelineDesc}>{item.descricao}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {embedUrl && (
                  <div className={styles.videoWrap}>
                    <iframe
                      src={embedUrl}
                      title={historia.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                {historia.imagens.length > 0 && (
                  <div className={styles.gallery}>
                    {historia.imagens.map(img => (
                      <figure key={img.id} className={styles.galleryItem}>
                        <img src={img.url} alt={img.legenda || historia.titulo} loading="lazy" />
                        {img.legenda && <figcaption>{img.legenda}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
