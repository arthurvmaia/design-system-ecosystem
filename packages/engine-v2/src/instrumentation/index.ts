/**
 * Barrel da instrumentação: o script pré-carregamento e os coletores.
 *
 * Existe para o resto do motor importar de um lugar só e para ficar evidente
 * onde vive TODO o código que roda dentro da página. Nada fora desta pasta é
 * injetado no navegador.
 */
export {
  ATTR_REF,
  INIT_SCRIPT,
  REGISTRO_GLOBAL,
  chamar,
  limparInstrumentacao,
} from './init-script.js';
export {
  ALVO_NO_PONTO_FN,
  ASSINATURA_ESTADO_FN,
  BLUR_FN,
  CENTRO_DO_REF_FN,
  COLETAR_CSS_FN,
  FOCAR_REF_FN,
  COLETAR_INSTRUMENTACAO_FN,
  COLETAR_JS_INLINE_FN,
  COLETAR_MAPA_FN,
  HTML_DO_REF_FN,
  MEDIR_ALVOS_FN,
  PORTAL_HTML_FN,
  ROLAR_ATE_REF_FN,
  ROLAR_PARA_FN,
  SONDAR_PONTO_FN,
} from './collectors.js';
