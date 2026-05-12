import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Db } from "@paperclipai/db";
import { reReviewQueueService } from "../services/re-review-queue.js";

function createMockDb(): Db {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "rrq-1",
            briefingId: "briefing-1",
            userId: "user-1",
            rating: "no",
            triggerReason: "no_rating",
            status: "pending",
            assignedReviewerId: null,
            dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
            completedAt: null,
            createdAt: new Date(),
          },
        ]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as Db;
}

describe("re-review queue service", () => {
  let mockDb: Db;
  let svc: ReturnType<typeof reReviewQueueService>;

  beforeEach(() => {
    mockDb = createMockDb();
    svc = reReviewQueueService(mockDb);
  });

  describe("create", () => {
    it("creates a re-review queue item with pending status", async () => {
      const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const item = await svc.create("briefing-1", "user-1", "no", "no_rating", dueAt);

      expect(item.briefingId).toBe("briefing-1");
      expect(item.userId).toBe("user-1");
      expect(item.rating).toBe("no");
      expect(item.triggerReason).toBe("no_rating");
      expect(item.status).toBe("pending");
    });
  });

  describe("listPending", () => {
    it("returns pending items ordered by dueAt", async () => {
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "rrq-1",
                briefingId: "briefing-1",
                userId: "user-1",
                rating: "no",
                triggerReason: "no_rating",
                status: "pending",
                assignedReviewerId: null,
                dueAt: new Date(),
                completedAt: null,
                createdAt: new Date(),
              },
            ]),
          }),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      });

      const items = await svc.listPending();
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("pending");
    });
  });

  describe("markCompleted", () => {
    it("updates status to completed with timestamp", async () => {
      const setFn = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: setFn });

      await svc.markCompleted("rrq-1");
      expect(setFn).toHaveBeenCalled();
      const setArg = setFn.mock.calls[0][0];
      expect(setArg.status).toBe("completed");
      expect(setArg.completedAt).toBeInstanceOf(Date);
    });
  });
});
