(() => {
  const params = new URLSearchParams(window.location.search);
  const handoff = params.get('handoff');
  const token = params.get('token');
  const link = document.getElementById('open-app');
  if (!handoff || !token || !link) return;
  const deepLink = `packproof://handoff/review?handoff=${encodeURIComponent(handoff)}&token=${encodeURIComponent(token)}`;
  link.setAttribute('href', deepLink);
  window.location.replace(deepLink);
})();
