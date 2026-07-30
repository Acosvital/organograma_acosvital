export interface HistoriaImagem {
  id:      string;
  url:     string;
  legenda: string;
}

export interface HistoriaTimelineItem {
  id:        string;
  ano:       number;
  titulo:    string;
  descricao: string;
  imagemUrl: string | null;
}

export interface HistoriaContent {
  titulo:    string;
  texto:     string;
  imagens:   HistoriaImagem[];
  timeline:  HistoriaTimelineItem[];
  videoUrl:  string | null;
  updatedAt: string;
}

export const HISTORIA_DEFAULT: HistoriaContent = {
  titulo:    'Nossa História',
  texto:     '',
  imagens:   [],
  timeline:  [],
  videoUrl:  null,
  updatedAt: new Date(0).toISOString(),
};
