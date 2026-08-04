/* public/js/pwa-register.js — registra o Service Worker do PWA.
 * Falha de registro é silenciosa (não polui o console): PWA é progressivo,
 * o app funciona normalmente sem ele. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      /* sem SW: app segue funcionando normalmente */
    });
  });
})();
