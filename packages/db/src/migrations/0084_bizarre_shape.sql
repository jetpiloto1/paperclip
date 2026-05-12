CREATE TABLE IF NOT EXISTS "briefing_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"category" text,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefing_negative_rating_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" text NOT NULL,
	"negative_count" integer NOT NULL,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefing_negative_rating_alerts_briefing_id_unique" UNIQUE("briefing_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefing_quality" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" text NOT NULL,
	"overall_score" text NOT NULL,
	"label" text NOT NULL,
	"dimension_scores" jsonb DEFAULT '[]' NOT NULL,
	"gate_results" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefing_quality_briefing_id_unique" UNIQUE("briefing_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crew_rating_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rating_type" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quality_score_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"dimension" text NOT NULL,
	"adjustment_amount" numeric(4, 2) NOT NULL,
	"previous_score" numeric(4, 2) NOT NULL,
	"new_score" numeric(4, 2) NOT NULL,
	"adjustment_source" text DEFAULT 'crew_rating' NOT NULL,
	"re_review_triggered" text,
	"tier_changed" text,
	"escalation_level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "re_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"briefing_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"trigger_reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_reviewer_id" text,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_feedback_briefing_idx" ON "briefing_feedback" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_feedback_user_idx" ON "briefing_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_quality_briefing_idx" ON "briefing_quality" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_quality_label_idx" ON "briefing_quality" USING btree ("label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crew_rating_flags_user_rating_idx" ON "crew_rating_flags" USING btree ("user_id","rating_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_score_adjustments_briefing_idx" ON "quality_score_adjustments" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_score_adjustments_user_idx" ON "quality_score_adjustments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "re_review_queue_briefing_idx" ON "re_review_queue" USING btree ("briefing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "re_review_queue_status_idx" ON "re_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "re_review_queue_due_at_idx" ON "re_review_queue" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_title_search_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_latest_body_search_idx" ON "documents" USING gin ("latest_body" gin_trgm_ops);