# PostHog Tracking Plan — CrewBrief

## Project Configuration

- PostHog project: **CrewBrief** (under crewbrief.com PostHog org)
- Environment variables: `POSTHOG_API_KEY`, `POSTHOG_HOST` (default `https://app.posthog.com`)
- SDK versions:
  - Frontend: `posthog-js` (NPM)
  - Backend: `posthog-node` (NPM)

## Events

### Acquisition Events

| Event | Trigger | Properties | SDK |
|---|---|---|---|
| `waitlist_signup` | User submits waitlist form | `email`, `operator_role`, `source` (utm_source / referral / direct), `referral_code` | Frontend |
| `referral_link_shared` | User clicks "share referral link" | `referral_code` | Frontend |
| `referral_conversion` | Referred user signs up | `referrer_email` (hashed), `referral_code` | Frontend |

### Activation Events

| Event | Trigger | Properties | SDK |
|---|---|---|---|
| `beta_invitation_sent` | Admin sends beta invitation from CrewBrief | `user_email` (hashed), `invitation_type` (email) | Backend |
| `beta_activation` | New user generates first briefing | `user_id`, `operator_role` | Backend |
| `briefing_generated` | Each briefing generation | `user_id`, `briefing_type` (pilot/cabin/tech), `flight_count`, `duration_ms` | Backend |

### Engagement Events

| Event | Trigger | Properties | SDK |
|---|---|---|---|
| `dashboard_viewed` | User opens CrewBrief dashboard | `user_id`, `briefing_count` | Frontend |
| `briefing_exported` | User exports/downloads a briefing | `user_id`, `format` (HTML/PDF) | Frontend |
| `briefing_shared` | User shares a briefing link | `user_id`, `share_method` (email/link) | Frontend |

### Feedback Events

| Event | Trigger | Properties | SDK |
|---|---|---|---|
| `feedback_submitted` | User submits feedback form | `user_id`, `category` (bug/feature/general), `sentiment` (positive/negative/neutral) | Frontend |
| `nps_response` | User responds to NPS survey | `user_id`, `score` (0-10) | Frontend |

### Retention Events

| Event | Trigger | Properties | SDK |
|---|---|---|---|
| `login` | User signs in | `user_id` | Frontend |
| `weekly_active` | Cron: active this week | `user_id`, `briefing_count_7d` | Backend |

## Conversion Funnel

```
waitlist_signup → beta_activation → briefing_generated (≥3 in first week) → paid_conversion
```

### Funnel Steps (PostHog Insights)

1. **Step 1 — Signed up**: `waitlist_signup`
2. **Step 2 — Activated**: `beta_activation` (first briefing generated)
3. **Step 3 — Engaged**: Distinct users with ≥3 `briefing_generated` events in first 7 days
4. **Step 4 — Converted**: `paid_conversion` (future — added when Stripe integration is live)

### Key Metrics

| Metric | Definition | PostHog Query |
|---|---|---|
| Signup-to-activation rate | % of waitlist signups who generate first briefing | Funnel: step 1 → step 2 |
| Activation-to-engagement rate | % of activated users who generate 3+ briefings in week 1 | Funnel: step 2 → step 3 |
| Time to activation | Avg hours from signup to first briefing | Trend: `beta_activation` with `$time_to_convert` |
| Weekly active users | Distinct users with ≥1 `login` event in trailing 7 days | Trend: DAU/WAU |

## Dashboards (PostHog)

1. **Conversion Funnel** — the 4-step funnel above with weekly trend
2. **Acquisition Sources** — `waitlist_signup` by `source` property (pie/bar)
3. **User Activity** — `briefing_generated` count per user (histogram)
4. **Retention** — Weekly retention cohort (users who return week-over-week)
5. **NPS Trend** — `nps_response` score over time (line chart)
6. **Referral Performance** — `referral_conversion` / `referral_link_shared` ratio

## User Identification

- Set `$identify` with `user_id` on login / session start
- Set user properties:
  - `operator_role`
  - `signup_date`
  - `plan_tier` (waitlist / beta / paid)
  - `company`
- Use `$group` for multi-operator companies (when supported)

## Event Naming Convention

- `snake_case` event names
- `snake_case` property names
- Prefix reserved for PostHog: `$` prefixed properties are system-defined
