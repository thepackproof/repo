const form = document.querySelector('#confirm-form');
const tokenInput = document.querySelector('#token');
const status = document.querySelector('#status');
const token = new URLSearchParams(location.search).get('token') || '';
if (tokenInput) tokenInput.value = token;
if (!token && status) status.textContent = 'This confirmation link is missing its token. Request a new deletion email.';
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  if (button) button.disabled = true;
  if (status) status.textContent = 'Submitting securely…';
  try {
    const body = new URLSearchParams({ token });
    const response = await fetch('/api/confirm-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'follow',
    });
    if (response.redirected || response.ok) {
      location.assign(response.url || '/deletion-confirmed.html');
      return;
    }
    location.assign('/deletion-invalid.html');
  } catch {
    if (status) status.textContent = 'The request could not be submitted. Try again later.';
    if (button) button.disabled = false;
  }
});
