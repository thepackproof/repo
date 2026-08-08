(() => {
  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const token = params.get('token');
  const link = document.getElementById('open-app');
  if (!session || !token || !link) return;
  const deepLink = `packproof://connect/capture?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`;
  link.setAttribute('href', deepLink);
  window.location.replace(deepLink);
})();
