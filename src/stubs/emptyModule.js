// Stub vazio: alvo do alias do pacote nativo opcional `canvas` (ver next.config.ts).
// `konva` só faz require('canvas') no branch de renderização em Node/servidor,
// nunca alcançado aqui porque o editor de imagem só roda no navegador
// (dynamic import com ssr:false) — o conteúdo deste módulo nunca é usado de fato.
module.exports = {};
