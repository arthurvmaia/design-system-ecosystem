/**
 * O portal é o vestíbulo da suíte: três portas, nada mais.
 *
 * O proxy de `/api/orbis` existe para o portão de senha continuar sendo UM só.
 * A credencial vive no servidor Hono (8787) e é ele quem confere; o portal
 * apenas desenha o formulário. Passando pelo proxy, o navegador enxerga tudo na
 * mesma origem — então não há CORS para configurar e o cookie `orbis_sessao`
 * viaja sozinho. É o mesmo arranjo que o app web já usa.
 */
declare const _default: import("vite").UserConfig;
export default _default;
