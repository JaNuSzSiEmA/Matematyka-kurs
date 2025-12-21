```markdown
# Matura Math Course — Starter Scaffold

This is a beginner-friendly starter scaffold for your course website (Option C but beginner-friendly).  
Stack: Next.js + TypeScript + Tailwind CSS, Supabase (Auth + Postgres + Storage), Stripe Checkout (test mode).

What this scaffold gives you:
- Next.js app (TypeScript) with Tailwind
- Supabase client and simple auth flow (signup/login)
- Protected dashboard and basic admin page skeleton
- Stripe Checkout endpoint (serverless) + webhook handler stub
- Example env file and deployment notes
- Step-by-step setup for a beginner

If you prefer, run the scaffold locally, explore the code, and gradually replace placeholders (video embeds, course data, etc.)

Quick links
- Next.js docs: https://nextjs.org/docs
- Supabase docs: https://supabase.com/docs
- Stripe docs: https://stripe.com/docs

Minimal local setup (step-by-step)
1. Install prerequisites
   - Node.js (LTS), Git, and VS Code.

2. Clone this repo (or create a new folder and copy files).
   - git clone <repo-url> (or open the folder)

3. Install dependencies
   - npm install

4. Create accounts and keys
   - Supabase: create a project and copy the API URL and anon key.
   - Stripe: create an account and get test secret key and publishable key.
   - (Optional) Vimeo/YouTube for video hosting.

5. Create environment file
   - Copy `.env.local.example` → `.env.local` and fill the values.

6. Run the dev server
   - npm run dev
   - Open http://localhost:3000

7. Test flows
   - Signup using Supabase auth on the landing page.
   - Visit /dashboard (protected).
   - Initiate a Checkout session from the landing page (test mode).
   - Use Stripe test cards (e.g., 4242 4242 4242 4242) in Stripe-hosted Checkout.

Deploying
- Push to GitHub and connect the repo to Vercel for automatic deployments.
- In Vercel, set the same environment variables from `.env.local`.
- For Stripe webhooks: set up the webhook URL in Stripe dashboard to point to `https://<your-domain>/api/stripe-webhook` and copy the webhook signing secret into your environment.

Next steps (recommended)
1. Populate Supabase DB with your course, sections, videos, exercises.
2. Replace placeholder pages with real content and video embeds.
3. Implement admin CRUD for course content (this scaffold contains a basic admin page to expand).
4. Add progress tracking and receipts.
5. Add Privacy Policy & Terms (required for production and GDPR).

If you want, I can:
- Expand the admin UI (full CRUD).
- Add Stripe webhook bookkeeping logic.
- Add server-side rendering protection for pages.
- Convert the simple in-memory example into a fully seeded Supabase schema and seed script.

Good luck — if you'd like, tell me which file or feature you want me to expand next and I’ll add it.
```