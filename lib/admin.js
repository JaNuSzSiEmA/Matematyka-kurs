import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function getSessionOrRedirect(router) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    router.replace('/login');
    return null;
  }
  return session;
}

export async function isCurrentUserAdmin() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

 

  if (!user) return false;

  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();



  if (error) return false;

  return Boolean(data?.user_id);
}