CREATE TABLE IF NOT EXISTS briefing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id text NOT NULL,
  user_id text NOT NULL,
  rating text NOT NULL,
  category text,
  free_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefing_feedback_briefing_idx ON briefing_feedback (briefing_id);
CREATE INDEX IF NOT EXISTS briefing_feedback_user_idx ON briefing_feedback (user_id, created_at);

CREATE TABLE IF NOT EXISTS briefing_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id text NOT NULL UNIQUE,
  overall_score text NOT NULL,
  label text NOT NULL,
  dimension_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  gate_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefing_quality_briefing_idx ON briefing_quality (briefing_id);
CREATE INDEX IF NOT EXISTS briefing_quality_label_idx ON briefing_quality (label);

CREATE TABLE IF NOT EXISTS briefing_negative_rating_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id text NOT NULL UNIQUE,
  negative_count integer NOT NULL,
  alerted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew_rating_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  rating_type text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  last_triggered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_rating_flags_user_rating_idx ON crew_rating_flags (user_id, rating_type);

CREATE TABLE IF NOT EXISTS re_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id text NOT NULL,
  user_id text NOT NULL,
  rating text NOT NULL,
  trigger_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_reviewer_id text,
  due_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS re_review_queue_briefing_idx ON re_review_queue (briefing_id);
CREATE INDEX IF NOT EXISTS re_review_queue_status_idx ON re_review_queue (status);
CREATE INDEX IF NOT EXISTS re_review_queue_due_at_idx ON re_review_queue (due_at);
