import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function CoursePage() {
  const router = useRouter();
  const { course_id } = router.query;
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    if (!course_id) return;
    (async () => {
      setChecking(true);
      // get session from supabase client
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('getSession error', error);
      }
      if (!session) {
        // not signed in - redirect to sign-in or message
        setChecking(false);
        setHasAccess(false);
        return;
      }

      const accessToken = session.access_token;
      // optional: show user email
      setUserEmail(session.user?.email || null);

      try {
        const res = await fetch(`/api/has-access?course_id=${encodeURIComponent(course_id)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const json = await res.json();
        setHasAccess(Boolean(json.access));
      } catch (e) {
        console.error('has-access fetch failed', e);
        setHasAccess(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [course_id]);

  if (checking) return <div>Checking access...</div>;

  if (!hasAccess) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Access denied</h1>
        <p>You don't have access to this course.</p>
        <p>Signed in as: {userEmail || 'not signed in'}</p>
        <p>If you purchased the course but still can't access it, make sure you used the same email for purchase and login.</p>
      </div>
    );
  }

  // Replace below with your actual course content
  return (
    <div style={{ padding: 24 }}>
      <h1>Course: {course_id}</h1>
      <p>Welcome — you have access!</p>
      <p>Put your course lessons/components here.</p>
    </div>
  );
}