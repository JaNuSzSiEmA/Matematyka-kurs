import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "../../lib/stripe";
import { buffer } from "micro";

export const config = {
  api: {
    bodyParser: false
  }
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method not allowed");

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"] || "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf.toString(), sig as string, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // Handle the event types you're interested in
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    // TODO: record purchase in your DB (Supabase). Use session.customer_details.email, session.id, etc.
    console.log("Checkout completed:", session.id);
  }

  res.json({ received: true });
}