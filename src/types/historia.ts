export interface HistoriaTimelineItem {
  id:        string;
  ano:       number;
  titulo:    string;
  descricao: string;
  imagemUrl: string | null;
}

export interface HistoriaContent {
  titulo: string;
  texto:  string;
  /** Foto de fundo da tela pública (por trás do gradiente escuro). A API
   *  externa não tem um campo dedicado — reaproveita a 1ª posição do array
   *  `imagens` (que também guardava a antiga galeria, removida da tela). */
  backgroundImageUrl: string | null;
  timeline:           HistoriaTimelineItem[];
  videoUrl:           string | null;
  updatedAt:          string;
}

export const HISTORIA_DEFAULT: HistoriaContent = {
  titulo:             'Nossa História',
  texto:              '',
  backgroundImageUrl: null,
  timeline:           [],
  videoUrl:           null,
  updatedAt:          new Date(0).toISOString(),
};
