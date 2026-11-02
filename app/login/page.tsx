'use client';
import { useState } from 'react';
import { api } from '@/components/ui';

const DEMO = ['admin@frp.test', 'spicegarden@frp.test', 'annapurna@frp.test', 'vikram@frp.test'];

export default function Login() {
  const [err, setErr] = useState('');
  return (
    <main style={{ maxWidth: 440 }}>
      <section>
        <h2>Food Waste Redistribution Platform: log in</h2>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try { const r = await api('auth/login', 'POST', f); location.href = '/' + r.role.toLowerCase(); }
          catch (x: any) { setErr(x.message); }
        }}>
          <label>Email<input name="email" type="email" required autoComplete="username" /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button>Log in</button>
        </form>
        <p>New here? <a href="/register">Create an account</a></p>
        <p className="muted" style={{ fontSize: 13 }}>Demo accounts (password <code>Password@123</code>): {DEMO.join(', ')}</p>
      </section>
    </main>
  );
}
