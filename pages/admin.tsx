import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import type { Session } from "@supabase/supabase-js";

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then((r: { data: { session: Session | null } }) => {
      const u = r.data.session?.user;
      if (!u) {
        router.push("/");
      } else {
        setUser(u);
        // Simple placeholder: mark first user as admin locally.
        // Replace with proper role checks in your DB.
        setIsAdmin(u.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
      }
    });
  }, [router]);

  if (!user) return <p className="p-6">Loading...</p>;
  if (!isAdmin) return <p className="p-6">Access denied: not an admin (set NEXT_PUBLIC_ADMIN_EMAIL in env).</p>;

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">Admin — Content Editor (Skeleton)</h1>
      <p className="mt-2">This page is a starting point. Implement CRUD for courses/sections here.</p>

      <section className="mt-6 bg-white p-6 rounded shadow max-w-3xl">
        <h2 className="font-semibold">Quick actions</h2>
        <ul className="list-disc pl-5 mt-2">
          <li>Create course</li>
          <li>Add section</li>
          <li>Upload video embed link</li>
        </ul>
      </section>
    </main>
  );
}