import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import Link from "next/link";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const session = supabase.auth.getSession().then(r => {
      if (r.data.session?.user) setUser(r.data.session.user);
      else router.push("/");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser(session.user);
      else router.push("/");
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [router]);

  if (!user) return <p className="p-6">Loading...</p>;

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">Welcome, {user.email}</p>

      <section className="mt-6 bg-white p-6 rounded shadow max-w-3xl">
        <h2 className="font-semibold">Your Courses</h2>
        <p className="mt-2">(Placeholder) — once purchased, your course list appears here.</p>
        <Link href="/" className="text-blue-600">Back to Home</Link>
      </section>

      <button
        className="mt-4 bg-red-500 text-white px-3 py-1 rounded"
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/");
        }}
      >
        Sign out
      </button>
    </main>
  );
}