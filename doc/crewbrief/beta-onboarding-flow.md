# Beta Tester Onboarding Flow

## Overview

From signup to first briefing activation — designed for < 5 minutes to first value.

---

## Step 0: Pre-Onboarding (Confirmation Email)

Sent immediately after waitlist signup.

**Subject**: You're on the CrewBrief beta waitlist — spot #[N]

**Content**:
- Queue position and what it means
- Referral link with "move up the list" incentive
- Preview: "Here's what a CrewBrief briefing looks like" (link to sample)
- "Follow us on LinkedIn for beta announcements"

---

## Step 1: Invitation Email (When Selected for Beta)

**Subject**: Your CrewBrief beta access is ready

**Content**:
- Welcome + congratulations message
- "Here's your personalized access link" (single-use token)
- Brief: "3 steps to your first briefing"
- Direct feedback channel: dedicated Slack/Discord link or email reply-to
- "Need help? Reply to this email — we'll respond within 2 hours"

---

## Step 2: Account Activation (Onboarding Page)

**Page**: `/onboarding` — logged in via access token

### 2a. Profile Setup
- Full Name
- Role (Pilot / Cabin Crew / Dispatcher / Ops Director / Other)
- Certificates (ATP / Commercial / Private / None) — optional
- Organization name
- Phone (for SMS briefings) — optional

### 2b. Briefing Preferences
- Preferred delivery: Email / SMS / Push (push requires app — coming soon)
- Briefing time: "Deliver [X] hours before duty"
- Briefing level: Standard / Detailed
- Include: Weather / NOTAMs / Route / Fuel / FRAT / Crew Notices (toggle)

### 2c. Schedule Connection (Optional)
- Manual entry: "Add a flight" (date, departure, arrival, time, aircraft)
- API connection: "Connect your scheduling system" (JetInsight, Sabre, etc. — placeholder for future)
- ICS feed URL (for systems that support calendar export)

### 2d. First Briefing
- "Generate my first briefing" button
- Uses most recent or sample flight data
- Shows rendered HTML briefing immediately

---

## Step 3: First Briefing Experience

After clicking "Generate my first briefing":

1. Briefing renders on screen
2. Highlighted callout: "⚠️ This is a sample — your real briefings will use your actual flight data"
3. **CTA**: "Looks good? Set up your schedule to get briefings automatically"
4. **Alt CTA**: "Send me another test with my real N-number"

---

## Step 4: Activation (Day 1)

### Auto-triggered after first briefing:
- **Welcome email #2 (Day 1)**: "Your first briefing — what to look for"
  - Explains FRAT score, warning codes, color coding
  - "Share feedback: reply to this email or use the in-briefing feedback button"
- **Feedback prompt**: Rate your first briefing (1-5)
- **NPS check (Day 3)**: "How likely are you to recommend CrewBrief?"

---

## Step 5: Ongoing Engagement

### Week 1
- **Day 2 email**: "Tips for getting the most out of CrewBrief"
- **Day 4 email**: "Feature spotlight — FRAT and risk assessment"
- **Day 7 check-in**: "How's your first week? Reply with one thing to improve"

### Week 2+
- Weekly briefing digest email
- Feature update notifications
- "Refer a colleague and earn priority support"
- Quarterly feedback survey

---

## Step 6: Conversion to Paid

### Trial to Paid Path
- Beta testers get **3 months free**
- After 3 months: grandfathered launch pricing — **$9.99 one-time purchase** or **$4.99/month subscription** (whichever model is chosen at launch; beta testers lock in the lowest rate CrewBrief will ever offer)
- Conversion email sequence:
  - **30 days before**: "Your beta period ends in 30 days — lock in CrewBrief at just $9.99 (one-time) or $4.99/mo"
  - **14 days before**: "Your beta discount expires in 2 weeks — $9.99 lifetime access won't last"
  - **7 days before**: "Last chance for beta pricing — $9.99 one-time or $4.99/mo, your choice"
  - **Expired**: Downgrade notice (no active subscription) — data retained for 90 days

---

## Success Metrics (Onboarding Funnel)

| Stage | Target | Measure |
|---|---|---|
| Invitation → Activation | 80% | Click through to onboarding page |
| Activation → First Briefing | 90% | Generate first briefing |
| First Briefing → Day 7 Active | 60% | At least 1 briefing in first 7 days |
| Day 7 → Paid Conversion | 40% | Convert to paid after beta period |
| NPS at 30 days | ≥ 40 | Survey score |

---

## Feedback Channels

- **In-briefing**: "Was this briefing helpful?" thumbs up/down
- **Email**: Reply-to on any automated email
- **Dedicated channel**: Slack community or Discord server
- **Monthly call**: 30-min video call with beta testers (optional)
- **Bug report**: Clear "Report an issue" link in every briefing footer

All feedback feeds into [CRE-61](/CRE/issues/CRE-61) (briefing feedback mechanism) and [CRE-67](/CRE/issues/CRE-67) (in-app feedback UI).
