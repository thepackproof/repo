import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';

export function SignInPage() {
  const { enabled, signInEmail, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInEmail(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in card">
      <p className="eyebrow">PackProof</p>
      <h1>Sign in</h1>
      <p className="lede">This is the authenticated PackProof Portal. It reads the same PackProof records as the mobile app. Capture stays on your phone.</p>
      {!enabled ? <p className="error">Firebase web configuration is missing. Copy portal/.env.example to portal/.env.local.</p> : null}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button className="btn" type="submit" disabled={busy || !enabled}>Sign in</button>
          <button className="btn secondary" type="button" disabled={busy || !enabled} onClick={() => void signInGoogle().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Google sign-in failed.'))}>Google</button>
        </div>
      </form>
    </main>
  );
}
