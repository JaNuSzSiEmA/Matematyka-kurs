import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "../../lib/stripe";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { priceId } = req.body;

    // Use Stripe Checkout. In test mode you can pass a priceId or create a line_items array.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?checkout=cancel`
    });

    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: err.message || "internal error" });
  }
}