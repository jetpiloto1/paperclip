# HubSpot CRM Setup — CrewBrief

## Account

- HubSpot account for CrewBrief under crewbrief.com domain
- Free CRM tier (sufficient for beta; upgrade to Starter/Professional when scaling)
- Single pipeline: **Operator Recruitment** (contacts = aviation operators)

## Contact Properties

| Property | Type | Source |
|---|---|---|
| `operator_role` | Dropdown | Captain, First Officer, Chief Pilot, Dispatch, Ops Manager |
| `operator_company` | Text | Airline / FBO / Charter name |
| `operator_country` | Text | Country of operation |
| `source_channel` | Dropdown | LinkedIn, Email, Forum, FBO Visit, Referral, Other |
| `referral_source` | Text | Name of person who referred |
| `outreach_date` | Date | First outreach date |
| `last_contact_date` | Date | Most recent touchpoint |
| `trial_started` | Date | When beta access granted |
| `trial_feedback` | Multi-line | Freeform feedback notes |
| `conversion_date` | Date | When converted to paid |

## Pipeline Stages

```
Outreach → Contacted → Conversation → Beta Tester → Customer → Churned
```

| Stage | Criteria | Automation |
|---|---|---|
| **Outreach** | Identified target operator, not yet contacted | Auto-create on import |
| **Contacted** | First message sent (LinkedIn DM, email, forum DM) | Move manually after outreach |
| **Conversation** | 2+ replies, active interest shown | Move after meaningful reply |
| **Beta Tester** | Granted CrewBrief beta access | Auto-move via integration when beta access granted |
| **Customer** | Converted to paid subscription | Move on payment event |
| **Churned** | Cancelled or inactive >60 days | Move on cancellation or inactivity trigger |

## Outreach Tracking

- Log each outreach action as a **Note** or **Task** on the contact record
- Task types:
  - LinkedIn DM sent
  - Email sent
  - Forum reply
  - FBO visit / in-person
  - Follow-up (sequence)
- Set follow-up tasks for 3-5 days after each touchpoint

## Integration Points (Future)

- **PostHog → HubSpot**: When `beta_activation` event fires in PostHog, sync `conversion_date` to HubSpot contact
- **Web app → HubSpot**: Waitlist signup creates HubSpot contact with `source_channel = Web Signup`
- **Stripe → HubSpot**: On subscription payment, move deal to Customer stage

## Dashboards

1. **Pipeline velocity** — time-in-stage per contact (avg days per stage)
2. **Source breakdown** — contacts created by channel (linkedin vs email vs forum)
3. **Conversion funnel** — stage-to-stage conversion rates
4. **Weekly activity** — outreach tasks completed per week
