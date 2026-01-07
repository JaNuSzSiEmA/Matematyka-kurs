import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false, // we need raw body to verify Stripe signature
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// helper to read raw request body without external deps
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('Missing stripe-signature header');
    return res.status(400).end('Missing signature');
  }

  let event;
  try {
    const buf = await getRawBody(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency: check if we've already processed this event
  try {
    const { data: existing, error: selErr } = await supabase
      .from('purchases')
      .select('id')
      .eq('event_id', event.id)
      .limit(1);
    if (selErr) console.warn('Supabase select error (idempotency check):', selErr.message);
    if (existing && existing.length > 0) {
      console.log('Event already processed, skipping:', event.id);
      return res.status(200).json({ received: true, skipped: true });
    }
  } catch (e) {
    console.warn('Idempotency check failed (continuing):', e.message);
  }

  // Process relevant events
  switch (event.type) {
    case 'checkout.session.completed': {
      try {
        // Retrieve full session with line items and product data to read product metadata
        const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
          expand: ['line_items.data.price.product', 'customer'],
        });

        const email = session.customer_details?.email || session.customer?.email || null;
        const amount_total = session.amount_total ?? null;
        const currency = session.currency ?? null;

        // Try to determine course_id:
        // preferred: session.metadata.course_id
        // fallback: product metadata on first line item
        let course_id = session.metadata?.course_id || null;
        try {
          const firstLine = session.line_items?.data?.[0];
          if (!course_id && firstLine) {
            const product = firstLine.price?.product;
            if (product && product.metadata && product.metadata.course_id) {
              course_id = product.metadata.course_id;
            }
          }
        } catch (e) {
          // ignore
        }

        // Insert purchase record (event_id unique ensures idempotency too)
        const { error: insertErr } = await supabase.from('purchases').insert({
          event_id: event.id,
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          email,
          amount_total,
          currency,
          course_id,
          status: 'paid',
        });

        if (insertErr) {
          // If unique constraint on event_id triggered, treat as processed
          if (insertErr.message && insertErr.message.includes('duplicate key value')) {
            console.log('Purchase already recorded (race):', event.id);
          } else {
            console.error('Failed to insert purchase:', insertErr);
          }
        } else {
          console.log('Purchase recorded for session', session.id);
        }

        // Grant access by inserting into user_courses (unique(email,course_id) avoids duplicates)
        if (email && course_id) {
          const { error: grantErr } = await supabase.from('user_courses').upsert(
            { email, course_id },
            { onConflict: ['email', 'course_id'] }
          );
          if (grantErr) {
            console.error('Failed to grant course access:', grantErr);
          } else {
            console.log(`Granted access to course ${course_id} for ${email}`);
          }
        } else {
          console.warn('Could not determine email or course_id — access not granted.', { email, course_id });
        }
      } catch (err) {
        console.error('Error processing checkout.session.completed:', err);
        return res.status(500).end();
      }
      break;
    }

    // optional: handle other types you care about
    case 'payment_intent.succeeded': {
      console.log('payment_intent.succeeded', event.data.object.id);
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  return res.status(200).json({ received: true });
}