(() => {
  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const token = params.get('token');
  const link = document.getElementById('open-app');
  if (!session || !token || !link) return;
  window.history.replaceState(null, '', window.location.pathname);
  const deepLink = `packproof://evidence-session/redeem?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`;
  link.setAttribute('href', deepLink);
  window.location.replace(deepLink);
})();
