import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function signIn() {
    setMsg('Signing in...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg('Error: ' + error.message);
    else setMsg('Signed in. Now open /courses/<course_id>');
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <br />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br />
      <button onClick={signIn}>Sign in</button>
      <p>{msg}</p>
    </div>
  );
}
