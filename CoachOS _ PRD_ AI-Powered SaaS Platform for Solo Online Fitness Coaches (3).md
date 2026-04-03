**CoachOS helps online fitness coaches double their clients without increasing their working hours — by replacing WhatsApp, PDFs, and manual admin with a single automated system.**

# CoachOS — PRD: AI-Powered SaaS Platform for Solo Online Fitness Coaches (UK Launch)

### TL;DR

## Why Now?

"Why Now?" — the three trigger events that make Jake switch this month, not next quarter:

1. He's just hit 25–30 clients and feels overwhelmed — his current WhatsApp + PDF system is physically breaking down at this volume.
2. He's losing clients due to poor experience — slow replies, unprofessional PDFs, missed check-ins are costing him renewals.
3. He wants to raise his prices — but can't justify premium rates without a premium product. He needs to look as good as coaches charging £300/month per client.

These triggers are not hypothetical. They are the real moments when a coach's pain becomes acute enough to act. CoachOS must be present — through content, referrals, or ads — exactly at these inflection points.

CoachOS is the all-in-one operating system for UK-based solo online fitness coaches who are stuck in the WhatsApp, PDFs, and Google Sheets chaos. It merges adaptive AI plan generation (with total coach control), seamless business operations, a live analytics-powered “Proof Engine,” and branded client experience under one platform. CoachOS eliminates manual admin, lets coaches scale to double the clients without extra hours, and builds professional trust with outcome data—no marketplace, no distractions.

---

## Pricing Strategy

All pricing in GBP. Freemium model anchored on client seats — the natural constraint Jake hits as he grows:

* **Free:** up to 5 clients — no credit card required. Enough to feel the product, not enough to run a business on.
* **Starter — £39/month:** up to 20 clients. Targets coaches just getting started or migrating from WhatsApp.
* **Pro — £79/month:** up to 50 clients. Core tier for Jake at his growth inflection point. Includes Proof Engine.
* **Elite — £149/month:** unlimited clients + full Proof Engine + white-label branding + priority support.

**Positioning note:** CoachOS is priced as a premium tool, not a cheap utility. A coach on the Pro plan at £79/month who manages 40 clients at £150/month each earns £6,000/month — CoachOS is 1.3% of their revenue. The ROI conversation is easy. Never compete on price; compete on outcome.

## Goals

### Business Goals

* Reach £10K MRR by Month 6, £38K MRR by Month 12, and £75K MRR by Month 18.
* Acquire 20 paying coaches in UK closed beta.
* Achieve North Star Metric: Monthly Active Clients managed on CoachOS.
* Establish UK GDPR compliance and Stripe GBP payment setup from launch.

### User Goals

* Eliminate 3–4 hours per day of manual admin (WhatsApp, chasing payments, plan updates).
* Professionally brand every client touchpoint—no more PDF/voice note mess.
* Seamlessly manage all revenue + recurring billing in GBP.
* Track, showcase, and share client transformations for organic growth.
* Easily onboard all clients in under two hours—replace every fragmented tool, instantly.

### Non-Goals

* Serve B2C fitness consumers directly—CoachOS is not a workout app for end-users.
* Build gym/facility management functionality—focus is for solo/online coaches, not multi-trainer gyms.
* Launch in the Indian market or localize for India (separate thesis exists).
* Launch or test a client-coach marketplace—marketplace is **out of scope** for this phase.

---

## User Stories

**Jake (Primary Persona — UK Fat-Loss Coach)**

* As a solo coach, I want to import my 20–30 clients from spreadsheets/WhatsApp so I can switch without friction.
* As a solo coach, I want to generate AI-powered plans for each client in less than 1 minute, but always have the final say—so I trust that the program fits my coaching style.
* As a solo coach, I want every client’s plan, progress, and payments all organized and visible in one dashboard—so nothing gets missed and I look (and feel) professional.
* As a solo coach, I want instant, branded onboarding and progress reports, so my clients get a premium experience and trust me more.
* As a solo coach, I want to see which clients are at risk, who’s checking in, and who needs follow-up—without chasing on WhatsApp.
* As a solo coach, I want to generate and share “Proof Engine” cards that highlight my client success, so I grow my business on Instagram with real transformation data.

**Scaling Coach (Advanced User)**

* As a coach scaling to >30 clients, I want to automate billing, VAT invoices, and subscriptions in GBP so my admin time stays flat as my business grows.
* As a group challenge host, I want to run a 30-day transformation for 50+ clients in one flow, track group progress, and send bulk nudges.
* As a power user, I want integration with Apple Health and Garmin, so I can offer data-driven, next-gen coaching.

---

## Functional Requirements

* **AI Coaching Engine** (Priority: P0)

  * Generate and update workout + nutrition plans, *with transparent AI recommendations and full coach override access.*
  * Adaptive logic—surfaces 'why' when suggesting changes (e.g., “3 missed check-ins, energy low”).
  * Weekly data-driven updates as client logs accumulate.

* **Client CRM** (Priority: P0)

  * Lightning-fast client onboarding (CSV import, WhatsApp/Sheets migration).
  * Branded intake flows, digital signature support, and client status tracking.
  * At-risk client alerts, check-ins, and wearable sync (Apple Health, Garmin).

* **Business Operations** (Priority: P0)

  * Stripe GBP payment processing—subscriptions, auto-billing, dunning, MRR/Churn dashboard.
  * Automated VAT invoicing for UK.
  * Zoom integration for live/scheduled sessions.
  * Cohort/group program builder (Phase 2+).

* **Engagement & Communication** (Priority: P1)

  * In-app messaging (full WhatsApp replacement).
  * Smart reminders, streak/milestone celebrations.
  * Morning dashboard showing: clients checked in, workouts logged, at-risk flags (core habit loop).

* **Proof Engine** (Priority: P1)

  * Branded, shareable transformation cards: before/after metrics, % goal completion, progress snapshots.
  * Auto-compiles from client check-ins, weight/photos, goal records.
  * Export/share functionality (Instagram, TikTok ready).
  * Outcome dashboard—shows retention, average client progress, client testimonial feed.

* **White-label & Branding** (Priority: P1 for domain/reports, P3 for mobile)

  * Custom domain, branded onboarding, logos/colors, client app is always coach-branded.
  * White-label mobile app (Phase 4+).

* **Analytics** (Priority: P1)

  * Revenue/trends dashboard (MRR, churn, LTV forecast).
  * A/B test outcomes, retention visualization, Proof Engine metrics.

---

## Retention Loop

CoachOS retention is not driven by features — it's driven by a daily habit loop that becomes structural for both coach and client. Once embedded, switching out feels like losing your entire business infrastructure.

**The Daily Retention Loop:**

1. Client logs workout/check-in → takes under 60 seconds in the mobile app
2. System auto-organises data → progress metrics updated, streaks tracked, energy logged
3. Coach sees → morning dashboard surfaces the full picture: who's on track, who's at risk, what moved
4. Coach nudges → one-tap smart message to at-risk clients, triggered by system alert — no manual hunting
5. Client improves → sees their own streak, milestone badge, progress chart — feels accountable and motivated
6. Loop repeats → daily, compounding. After 2–3 weeks, both coach and client are behaviourally hooked.

The loop works in both directions: clients stay because they feel seen and progressing. Coaches stay because their entire business visibility lives here. Neither party has an easy exit once the loop is running.

## User Experience

**Entry Point & First-Time User Experience**

* Jake discovers CoachOS through Instagram, YouTube pods, or a peer referral.
* Onboarding is zero-stress: sign up, brand setup, then a single “Import Clients” step (CSV/upload/WhatsApp export).
* CoachOS detects, validates, and adds every client—pre-populates contact, status, history.
* Jake clicks “Generate Plans”—AI produces initial workout/nutrition plans for every client in his list, all in under two minutes.
* On a single confirmation screen, Jake reviews (and tweaks) the plans, then clicks “Send All”—every client gets a branded app experience in seconds.

**The Inevitable Hook: Morning Dashboard**

* **Next Morning:** Jake wakes up and opens CoachOS.
  * Every client’s workout and check-in recorded, not a single WhatsApp chase.
  * Red flags highlight two “at-risk” clients to nudge, while the rest are on streaks.
  * All progress photos and logged metrics sorted per client—no scrolling, no manual copy-paste.
  * Revenue dashboard is up to date, scheduled payments just worked—no PayPal chase, no invoice reminders.
* This *“everything is structured, tracked, and visible without me lifting a finger”* moment is the point of no return. Jake knows he can never go back.

**After Three Months**

* Jake’s at 45 clients and has doubled revenue to £8K/month.
* His Proof Engine dashboard shows: “81% of your clients hit their 8-week goal.”
* Jake shares a branded transformation card on Instagram—new DMs roll in, clients trust him before he even replies.

---

## Success Metrics

### User-Centric Metrics

* Admin time per week: reduced from 15+ hours to <4 hours (tracked in-app and via coach survey).
* % of clients completing 5+ check-ins/week: target 70%+.
* % of at-risk clients successfully re-engaged.
* Coach NPS >50.
* Average time-to-onboard all clients: under 2 hours for 25 clients.

### Business Metrics

* MRR: £10K by Month 6, £38K by Month 12, £75K by Month 18.
* Monthly Active Clients managed.
* % of GBP transactions processed successfully.
* Proof Engine card shares per coach per month (lead indicator for referral/acquisition).

### Technical Metrics

* Plan generation latency: <60s per client.
* App uptime: >99.9%.
* Stripe payment success rate: >99%.
* Wearable data sync success >97%.

### Tracking Plan

* coach_onboarded
* client_imported
* plan_generated
* plan_override_by_coach
* client_checkin_completed
* payment_processed
* morning_dashboard_opened
* proof_card_generated
* proof_card_shared
* plan_adapted (AI)
* churn_alert_triggered
* group_program_created

---

## Technical Considerations

## Migration Risk & Safety

Switching from WhatsApp + spreadsheets is Jake's biggest psychological barrier — not price, not features. The fear is: "What if something breaks and I lose my clients?" CoachOS must solve this explicitly:

1. **Parallel Run Mode** — Jake can run CoachOS alongside WhatsApp for the first 7 days. Clients are onboarded to the app but Jake still has access to message them on WhatsApp if needed. No hard cutover.
2. **Migration Assistant** — a guided, step-by-step wizard that imports clients from CSV/spreadsheet, maps data fields, flags errors before committing, and previews the result before anything goes live.
3. **Rollback Option** — within the first 14 days, Jake can export all his data (clients, plans, payments history) in a portable format. No lock-in. This must be communicated clearly during onboarding — it reduces switching anxiety significantly.
4. **White-glove onboarding for beta coaches** — during the 20-coach closed beta, offer a live 30-minute onboarding call to ensure zero-failure first experience.

### Technical Needs

* APIs for AI plan generation (with explanation context returned), client onboarding, payment management, analytics, and Proof Engine.
* Data models: user (coach/client), plan, payment, check-in, outcome/proof metric, wearable log.
* React web dashboard (coach), React Native client app.
* Backend: Node.js/TypeScript, PostgreSQL, Redis, Supabase, BullMQ.
* AI: OpenAI GPT-4o API with LangChain orchestration—no separate AI team in Phase 1; handled by backend engineers.
* AWS eu-west-2 only (UK) in Phase 1.

### Integration Points

* Apple Health, Garmin for client data ingestion.
* Stripe Connect for GBP payments, VAT invoices.
* Zoom for scheduling/live sessions.
* Mixpanel/PostHog for product analytics, Sentry/Intercom for errors/support.

### Data Storage & Privacy

* All client/coach data stored in UK AWS for GDPR compliance.
* Automated VAT invoicing via Stripe (UK rules only).
* No multi-region data storage, no non-UK compliance in MVP.

### Scalability & Performance

* Designed for 100+ coaches and up to 4,000 active client seats on Day 1.
* Horizontal scaling prepped for later CA/SG/AU/UAE expansion post-UK traction.

### Potential Challenges (Phase 1 Scope Only)

* Maintaining AI transparency/coach override UX.
* Stripe onboarding friction for UK sole traders/limited cos.
* Data import from WhatsApp/Excel—mapping, validation, privacy.
* Proving value before sufficient check-in data accumulates (addressed by Proof Engine v1 leveraging initial week progress).

---

## Milestones & Sequencing

### Project Estimate

* Lean: 9–12 months for core roadmap, team of 5.

### Team Size & Composition

* 1 PM/Founder
* 2 Full-stack engineers
* 1 Mobile engineer
* 1 Product designer

### Phased Roadmap

**Phase 1: Discovery & UK Setup (Weeks 1–4)**

* Legal review (UK GDPR), Stripe GBP setup, AWS eu-west-2, CoachOS design system, onboarding journeys.

**Phase 2: MVP Build (Weeks 5–12)**

* AI plans (with override/transparency UX), client import, Stripe billing GBP, branded onboarding, in-app messaging, check-ins, morning dashboard.

**Phase 3: Closed Beta & Launch (Weeks 13–18)**

* 20-coach UK beta, rapid feedback, onboarding tuning, first revenue, iterate to stable public UK launch.

**Phase 4: Growth & Proof Engine (Months 5–9)**

* Proof Engine (branded progress/outcome cards + dashboard), group coaching, wearables, adaptive AI, referral program.

**Phase 5: Multimarket Expansion (Months 10+)**

* Begin CA, AU, SG, UAE legal/payment setup; white-label mobile, churn AI, future localization.

---

## Narrative

Jake is a UK-based fat-loss coach with 12,000 Instagram followers and 27 loyal clients. Every night, he loses hours to WhatsApp — sending PDFs, chasing payments, and tracking clumsy progress photos in Google Sheets. He knows he could earn more, but feels stuck and unprofessional compared to the polished coaches he sees on YouTube.

Then Jake tries CoachOS. In one afternoon, he imports all his clients, generates AI-powered plans (with a single review click), and instantly upgrades every client to a slick, branded app. No more PDFs. No more WhatsApp. Payments and onboarding run themselves.

But the “point of no return” arrives the very next morning: Jake wakes up, opens his dashboard, and sees that every client checked in, all progress is logged, and two at-risk clients are flagged for support — without him chasing a single person. For the first time, his business feels structured and scalable.

Three months later, Jake manages 45 clients and £8,000/month in revenue. His Proof Engine dashboard shows: “81% of your clients hit their 8-week goal.” He posts a transformation card on Instagram, and gets three new enquiries by dinner. Now, he’s not just working more efficiently — he’s proud to show the structure behind his results.

---

## What CoachOS is NOT

* Not a B2C fitness app: it does not serve consumers/end-users looking for workouts.
* Not gym management software: it is not for multi-coach club/gym operation.
* Not a solution for the India market (at this phase): see CoachOS India thesis.
* Not a supplement/meals platform, nor a discovery/marketplace product (marketplace is out of scope for current PRD).

---

## Unique Value Propositions (USPs) vs Competitors

1. **Outcome Intelligence**: Coaches prove client results with live data and transformation cards—a true “Proof Engine”, not just a plan generator.
2. **Adaptive AI, Transparent and Coach-First**: AI signals admin bottlenecks and recommends plan updates (with clear reasoning), but final call is always coach-driven—AI never substitutes for real coaching skill.
3. **Group Coaching and Cohorts**: Instant launch of scalable challenges for up to 200+ clients, with progress tracking for every participant.
4. **Business Dashboard**: Full insight on MRR, churn, revenue forecast—Jake always knows where his business stands, no more guesswork.
5. **White-Label Branded Experience**: Every email, plan, app screen—totally branded to Jake, not CoachOS. Like Shopify for fitness.
6. **Proof Engine**: Proprietary success metric engine generates branded cards—fueling word-of-mouth, Instagram growth, and organic scaling.

---

*This PRD reflects the sharpened ICP, UK-only launch, AI positioning for coach trust, the removal of marketplace/discovery, the critical Proof Engine addition, and direct alignment with the “can’t go back” onboarding and next-morning UX hook. All product, design, and growth decisions are now filtered directly through Jake’s day-to-day reality and aspiration.*