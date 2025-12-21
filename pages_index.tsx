import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import axios from "axios";

export default function Home() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setMessage(error.message);
    else setMessage("Check your email for a login link (Supabase OTP).");
  }

  async function buyCourse() {
    try {
      const res = await axios.post("/api/create-checkout-session", {
        priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
      });
      const { url } = res.data;
      if (url) window.location.href = url;
    } catch (err: any) {
      alert("Failed to create checkout session: " + (err?.message || err));
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start p-8">
      <header className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold">Matura Math — Course</h1>
        <p className="mt-2 text-gray-600">Short videos, text explanations and exercises.</p>
        <nav className="mt-4">
          <Link href="/dashboard" className="text-blue-600 mr-4">Dashboard</Link>
          <Link href="/admin" className="text-gray-600">Admin</Link>
        </nav>
      </header>

      <section className="w-full max-w-3xl mt-8 bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold">Buy full course</h2>
        <p className="mt-2">Price example: 50 PLN (test)</p>
        <button onClick={buyCourse} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded">
          Buy Course (Stripe Checkout)
        </button>
      </section>

      <section className="w-full max-w-3xl mt-6 bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold">Quick login (email)</h2>
        <form onSubmit={signInEmail} className="flex gap-2">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-2 rounded flex-1"
          />
          <button className="bg-green-600 text-white px-3 rounded">Send link</button>
        </form>
        {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
      </section>

      <footer className="w-full max-w-3xl mt-8 text-sm text-gray-500">
        <p>Use the Admin page to add content. This scaffold uses Supabase for auth/data and Stripe for payments.</p>
      </footer>
    </main>
  );
}