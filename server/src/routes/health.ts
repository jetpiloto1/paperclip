import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { heartbeatRuns, instanceUserRoles, invites } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { readPersistedDevServerStatus, toDevServerHealthStatus } from "../dev-server-status.js";
import { logger } from "../middleware/logger.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import type { StorageService } from "../storage/types.js";
import { serverVersion } from "../version.js";

const serverStartTime = Date.now();

function shouldExposeFullHealthDetails(
  actorType: "none" | "board" | "agent" | null | undefined,
  deploymentMode: DeploymentMode,
) {
  if (deploymentMode !== "authenticated") return true;
  return actorType === "board" || actorType === "agent";
}

function hasDevServerStatusToken(providedToken: string | undefined) {
  const expectedToken = process.env.PAPERCLIP_DEV_SERVER_STATUS_TOKEN?.trim();
  const token = providedToken?.trim();
  if (!expectedToken || !token) return false;

  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    storageService?: StorageService;
    pluginWorkerManager?: PluginWorkerManager;
  } = {
    deploymentMode: "local_trusted",
    deploymentExposure: "private",
    authReady: true,
    companyDeletionEnabled: true,
  },
) {
  const router = Router();

  router.get("/", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    const exposeFullDetails = shouldExposeFullHealthDetails(
      actorType,
      opts.deploymentMode,
    );
    const exposeDevServerDetails =
      exposeFullDetails || hasDevServerStatusToken(req.get("x-paperclip-dev-server-status-token"));

    if (!db) {
      res.json(
        exposeFullDetails
          ? { status: "ok", version: serverVersion }
          : { status: "ok", deploymentMode: opts.deploymentMode },
      );
      return;
    }

    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      logger.warn({ err: error }, "Health check database probe failed");
      res.status(503).json({
        status: "unhealthy",
        version: serverVersion,
        error: "database_unreachable"
      });
      return;
    }

    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    let bootstrapInviteActive = false;
    if (opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";

      if (bootstrapStatus === "bootstrap_pending") {
        const now = new Date();
        const inviteCount = await db
          .select({ count: count() })
          .from(invites)
          .where(
            and(
              eq(invites.inviteType, "bootstrap_ceo"),
              isNull(invites.revokedAt),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, now),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0));
        bootstrapInviteActive = inviteCount > 0;
      }
    }

    const persistedDevServerStatus = readPersistedDevServerStatus();
    let devServer: ReturnType<typeof toDevServerHealthStatus> | undefined;
    if (exposeDevServerDetails && persistedDevServerStatus && typeof (db as { select?: unknown }).select === "function") {
      const instanceSettings = instanceSettingsService(db);
      const experimentalSettings = await instanceSettings.getExperimental();
      const activeRunCount = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(inArray(heartbeatRuns.status, ["queued", "running"]))
        .then((rows) => Number(rows[0]?.count ?? 0));

      devServer = toDevServerHealthStatus(persistedDevServerStatus, {
        autoRestartEnabled: experimentalSettings.autoRestartDevServerWhenIdle ?? false,
        activeRunCount,
      });
    }

    if (!exposeFullDetails) {
      res.json({
        status: "ok",
        deploymentMode: opts.deploymentMode,
        bootstrapStatus,
        bootstrapInviteActive,
        ...(devServer ? { devServer } : {}),
      });
      return;
    }

    res.json({
      status: "ok",
      version: serverVersion,
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      bootstrapStatus,
      bootstrapInviteActive,
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
      ...(devServer ? { devServer } : {}),
    });
  });

  router.get("/deep", async (req, res) => {
    let anyFailed = false;

    const paperclip: "ok" | "failed" = "ok";

    let database: "ok" | "failed" = "ok";

    if (db) {
      try {
        await db.execute(sql`SELECT 1`);
      } catch (error) {
        logger.warn({ err: error }, "Deep health check database probe failed");
        database = "failed";
        anyFailed = true;
      }
    }

    let migrations: "ok" | "failed" = "ok";
    let migrationsDetail: string | undefined;

    if (db) {
      try {
        const result = await db.execute(
          sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
        );
        const migrationRow = Array.isArray(result) ? (result[0] as { count?: number }) : undefined;
        const count = Number(migrationRow?.count ?? 0);
        if (count === 0) {
          migrations = "failed";
          migrationsDetail = "no_applied_migrations";
          anyFailed = true;
        }
      } catch (error) {
        logger.warn({ err: error }, "Deep health check migrations probe failed");
        migrations = "failed";
        migrationsDetail = "migrations_check_error";
        anyFailed = true;
      }
    }

    let background: "ok" | "failed" = "ok";
    let backgroundDetail: string | undefined;

    if (db) {
      try {
        const recentWindow = new Date(Date.now() - 300_000);
        const recentRun = await db
          .select({ count: count() })
          .from(heartbeatRuns)
          .where(gt(heartbeatRuns.createdAt, recentWindow))
          .then((rows) => Number(rows[0]?.count ?? 0));
        if (recentRun === 0) {
          background = "failed";
          backgroundDetail = "no_recent_heartbeat_runs";
          anyFailed = true;
        }
      } catch (error) {
        logger.warn({ err: error }, "Deep health check background probe failed");
        background = "failed";
        backgroundDetail = "background_check_error";
        anyFailed = true;
      }
    }

    const responseBody: Record<string, unknown> = {
      ok: !anyFailed,
      paperclip,
      database,
      migrations,
      background,
      timestamp: new Date().toISOString(),
    };

    if (migrationsDetail) responseBody.migrations_detail = migrationsDetail;
    if (backgroundDetail) responseBody.background_detail = backgroundDetail;

    if (anyFailed) {
      res.status(503);
    }

    res.json(responseBody);
  });

  return router;
}
