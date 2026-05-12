import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Db } from "@paperclipai/db";
import { scoreAdjustmentEngine } from "../services/score-adjustment-engine.js";
import { BRIEFING_QUALITY_DIMENSIONS, BRIEFING_MANDATORY_GATE_IDS } from "@paperclipai/shared";

let lastInsertedValues: Record<string, unknown> | null = null;

function createMockDb(whereResult: unknown[] = []): Db {
  lastInsertedValues = null;
  const returningFn = vi.fn().mockImplementation(() => {
    return Promise.resolve([
      {
        id: "adj-1",
        briefingId: lastInsertedValues?.briefingId ?? "briefing-1",
        userId: lastInsertedValues?.userId ?? "user-1",
        rating: lastInsertedValues?.rating ?? "yes",
        dimension: lastInsertedValues?.dimension ?? "operational_usefulness",
        adjustmentAmount: lastInsertedValues?.adjustmentAmount ?? "0.00",
        previousScore: lastInsertedValues?.previousScore ?? "0.00",
        newScore: lastInsertedValues?.newScore ?? "0.00",
        adjustmentSource: lastInsertedValues?.adjustmentSource ?? "crew_rating",
        reReviewTriggered: lastInsertedValues?.reReviewTriggered ?? null,
        tierChanged: lastInsertedValues?.tierChanged ?? null,
        escalationLevel: lastInsertedValues?.escalationLevel ?? null,
        createdAt: new Date(),
      },
    ]);
  });
  const valuesFn = vi.fn().mockImplementation((values: Record<string, unknown>) => {
    lastInsertedValues = values;
    return { returning: returningFn, onConflictDoUpdate: vi.fn().mockResolvedValue([]) };
  });
  const limitFn = vi.fn().mockImplementation(() => Promise.resolve(whereResult));
  const whereChain = {
    limit: limitFn,
    then: (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(whereResult).then(onFulfilled),
    catch: (onRejected: (reason: unknown) => unknown) => Promise.resolve(whereResult).catch(onRejected),
  };
  const whereFn = vi.fn().mockReturnValue(whereChain);
  return {
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: whereFn, orderBy: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
    transaction: vi.fn(),
  } as unknown as Db;
}

function createExistingQualityRecord(overrides?: Record<string, unknown>) {
  const defaultDimensionScores = BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
    dimension: dim,
    score: dim === "operational_usefulness" ? 3.0 : 4.0,
    details: `${dim} evaluation passed`,
  }));

  const defaultGateResults = BRIEFING_MANDATORY_GATE_IDS.map((gid) => ({
    gateId: gid,
    dimension: gid.startsWith("A") ? "accuracy" as const : gid.startsWith("B") ? "completeness" as const : gid.startsWith("D") ? "timeliness" as const : "operational_usefulness" as const,
    passed: true,
    details: "gate passed",
  }));

  return {
    briefingId: "briefing-1",
    overallScore: "3.80",
    label: "standard",
    dimensionScores: defaultDimensionScores,
    gateResults: defaultGateResults,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("score adjustment engine", () => {
  let mockDb: Db;
  let engine: ReturnType<typeof scoreAdjustmentEngine>;

  beforeEach(() => {
    mockDb = createMockDb([]);
    engine = scoreAdjustmentEngine(mockDb);
  });

  describe("processRating", () => {
    it("adjusts operational usefulness score up by 0.2 on 'yes' rating", async () => {
      mockDb = createMockDb([createExistingQualityRecord()]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "yes");

      expect(result.adjustment.adjustmentAmount).toBe("0.2");
      expect(result.adjustment.previousScore).toBe("3");
      expect(result.adjustment.newScore).toBe("3.2");
      expect(result.adjustment.adjustmentSource).toBe("crew_rating");
      expect(result.tierChanged).toBe(true);
      expect(result.reReviewTriggered).toBeNull();
    });

    it("adjusts operational usefulness score down by 0.3 on 'no' rating", async () => {
      mockDb = createMockDb([createExistingQualityRecord()]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "no");

      expect(result.adjustment.adjustmentAmount).toBe("-0.3");
      expect(result.adjustment.previousScore).toBe("3");
      expect(result.adjustment.newScore).toBe("2.7");
      expect(result.reReviewTriggered).toBe("no_rating");
      expect(result.reReviewItem).not.toBeNull();
    });

    it("makes no score change on 'somewhat' rating", async () => {
      mockDb = createMockDb([createExistingQualityRecord()]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "somewhat");

      expect(result.adjustment.adjustmentAmount).toBe("0");
      expect(result.adjustment.previousScore).toBe("3");
      expect(result.adjustment.newScore).toBe("3");
    });

    it("clamps score to 0 minimum", async () => {
      mockDb = createMockDb([
        createExistingQualityRecord({
          dimensionScores: BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
            dimension: dim,
            score: dim === "operational_usefulness" ? 0.1 : 4.0,
            details: "",
          })),
        }),
      ]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "no");

      expect(result.adjustment.newScore).toBe("0");
    });

    it("clamps score to 5.0 maximum", async () => {
      mockDb = createMockDb([
        createExistingQualityRecord({
          dimensionScores: BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
            dimension: dim,
            score: dim === "operational_usefulness" ? 4.9 : 5.0,
            details: "",
          })),
        }),
      ]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "yes");

      expect(result.adjustment.newScore).toBe("5");
    });

    it("detects tier change when score crosses boundary", async () => {
      mockDb = createMockDb([
        createExistingQualityRecord({
          overallScore: "3.94",
          label: "standard",
          dimensionScores: BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
            dimension: dim,
            score: dim === "operational_usefulness" ? 3.7 : 4.0,
            details: "",
          })),
        }),
      ]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "no");

      expect(result.tierChanged).toBe(true);
      expect(result.previousLabel).toBe("standard");
      expect(result.newLabel).toBe("degraded");
    });

    it("creates a quality score adjustment record with audit trail", async () => {
      mockDb = createMockDb([createExistingQualityRecord()]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "yes");

      expect(result.adjustment.adjustmentSource).toBe("crew_rating");
      expect(result.adjustment.dimension).toBe("operational_usefulness");
    });

    it("handles missing existing classification (first rating)", async () => {
      mockDb = createMockDb([]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("new-briefing", "user-1", "yes");

      expect(result.adjustment.previousScore).toBe("0");
      expect(result.adjustment.newScore).toBe("0.2");
    });

    it("returns escalation warning when label degrades to 'degraded'", async () => {
      mockDb = createMockDb([
        createExistingQualityRecord({
          overallScore: "3.72",
          label: "standard",
          dimensionScores: BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
            dimension: dim,
            score: dim === "operational_usefulness" ? 3.6 : 3.75,
            details: "",
          })),
        }),
      ]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "no");

      expect(result.escalationLevel).toBe("warning");
    });

    it("returns escalation critical when label degrades to 'failed'", async () => {
      mockDb = createMockDb([
        createExistingQualityRecord({
          overallScore: "3.0",
          label: "degraded",
          dimensionScores: BRIEFING_QUALITY_DIMENSIONS.map((dim) => ({
            dimension: dim,
            score: dim === "operational_usefulness" ? 1.8 : 3.0,
            details: "",
          })),
        }),
      ]);
      engine = scoreAdjustmentEngine(mockDb);

      const result = await engine.processRating("briefing-1", "user-1", "no");

      expect(result.escalationLevel).toBe("critical");
    });
  });
});
