import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const qualityScoreAdjustments = pgTable(
  "quality_score_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    briefingId: text("briefing_id").notNull(),
    userId: text("user_id").notNull(),
    rating: text("rating").notNull(),
    dimension: text("dimension").notNull(),
    adjustmentAmount: numeric("adjustment_amount", { precision: 4, scale: 2 }).notNull(),
    previousScore: numeric("previous_score", { precision: 4, scale: 2 }).notNull(),
    newScore: numeric("new_score", { precision: 4, scale: 2 }).notNull(),
    adjustmentSource: text("adjustment_source").notNull().default("crew_rating"),
    reReviewTriggered: text("re_review_triggered"),
    tierChanged: text("tier_changed"),
    escalationLevel: text("escalation_level"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    briefingIdx: index("quality_score_adjustments_briefing_idx").on(table.briefingId),
    userIdx: index("quality_score_adjustments_user_idx").on(table.userId),
  }),
);
