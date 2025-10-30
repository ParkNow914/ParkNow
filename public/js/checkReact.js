// Verificação simples para garantir que React e ReactDOM foram carregados
(function () {
  var hasReact = typeof window !== 'undefined' && typeof window.React !== 'undefined';
  var hasReactDOM = typeof window !== 'undefined' && typeof window.ReactDOM !== 'undefined';

  if (!hasReact || !hasReactDOM) {
    console.error('[checkReact] React ou ReactDOM não foram carregados antes dos componentes.');
  }
  // Remover log de sucesso em produção
})();


