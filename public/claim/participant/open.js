(() => {
  const params = new URLSearchParams(window.location.search);
  const claim = params.get('claim');
  const token = params.get('token');
  const link = document.getElementById('open-app');
  if (!claim || !token || !link) return;
  window.history.replaceState(null, '', window.location.pathname);
  const deepLink = `packproof://claim/participant?claim=${encodeURIComponent(claim)}&token=${encodeURIComponent(token)}`;
  link.setAttribute('href', deepLink);
  window.location.replace(deepLink);
})();
