import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import {
  crewbriefTrips,
  crewbriefLegs,
  crewbriefAirports,
  crewbriefAircraft,
  crewbriefDutyDays,
  crewbriefCrewMembers,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import type { FlightCrewBriefing } from "@paperclipai/shared";
import { briefingGenerationService } from "./briefing-generation.js";

const genSvc = briefingGenerationService();

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../crewbrief-landing/briefing.html",
);

let template: string | null = null;

function loadTemplate(): string | null {
  if (template) return template;
  try {
    template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    return template;
  } catch {
    return null;
  }
}

export async function getBriefing(
  db: Db,
  tripId: string,
  dutyDayId: string,
): Promise<FlightCrewBriefing | null> {
  const [trip] = await db
    .select()
    .from(crewbriefTrips)
    .where(eq(crewbriefTrips.tripId, tripId))
    .limit(1);

  if (!trip) return genSvc.generate(tripId, dutyDayId);

  const legs = await db
    .select()
    .from(crewbriefLegs)
    .where(eq(crewbriefLegs.tripId, tripId))
    .orderBy(crewbriefLegs.legNumber);

  const dutyDay = dutyDayId
    ? (await db
        .select()
        .from(crewbriefDutyDays)
        .where(eq(crewbriefDutyDays.dutyDayId, dutyDayId))
        .limit(1))[0] ?? null
    : null;

  const primaryLeg = legs[0] ?? null;
  if (!primaryLeg) return genSvc.generate(tripId, dutyDayId);

  const [originAirport] = primaryLeg.origin
    ? await db.select().from(crewbriefAirports).where(eq(crewbriefAirports.icao, primaryLeg.origin)).limit(1)
    : [];
  const [destAirport] = primaryLeg.destination
    ? await db.select().from(crewbriefAirports).where(eq(crewbriefAirports.icao, primaryLeg.destination)).limit(1)
    : [];
  const [aircraft] = primaryLeg.aircraftId
    ? await db.select().from(crewbriefAircraft).where(eq(crewbriefAircraft.id, primaryLeg.aircraftId)).limit(1)
    : [];
  const crewMember = dutyDay?.crewMemberId
    ? (await db.select().from(crewbriefCrewMembers).where(eq(crewbriefCrewMembers.id, dutyDay.crewMemberId)).limit(1))[0] ?? null
    : null;

  return {
    tripId,
    dutyDayId: dutyDayId ?? "",
    overview: {
      flightDate: dutyDay?.dutyDate ?? trip.startDate ?? "",
      departure: originAirport?.icao ?? primaryLeg.origin ?? "",
      arrival: destAirport?.icao ?? primaryLeg.destination ?? "",
      aircraftType: aircraft?.type ?? "",
      flightNumber: primaryLeg.flightNumber ?? "",
      crewPosition: dutyDay?.position ?? crewMember?.role ?? "",
      scheduledDeparture: primaryLeg.scheduledDeparture ?? "",
      scheduledArrival: primaryLeg.scheduledArrival ?? "",
    },
    weather: {
      departure: { station: originAirport?.icao ?? primaryLeg.origin ?? "", metar: "", taf: "" },
      arrival: { station: destAirport?.icao ?? primaryLeg.destination ?? "", metar: "", taf: "" },
      alternate: null,
      enroute: [],
    },
    notams: { departure: [], arrival: [], enroute: [] },
    route: {
      departure: originAirport?.icao ?? primaryLeg.origin ?? "",
      arrival: destAirport?.icao ?? primaryLeg.destination ?? "",
      alternate: primaryLeg.alternate ?? null,
      filedAltitude: primaryLeg.filedAltitude ?? "",
      estimatedTimeEnroute: primaryLeg.estimatedTimeEnroute ?? "",
      fuelOnBoard: primaryLeg.fuelPlan ?? "",
      distance: primaryLeg.distance ?? "",
    },
    alerts: { items: [] },
  };
}

export async function getBriefingHtml(
  db: Db,
  tripId: string,
  dutyDayId: string,
): Promise<string | null> {
  const tpl = loadTemplate();
  if (!tpl) return null;

  const briefing = await getBriefing(db, tripId, dutyDayId);
  if (!briefing) return null;

  const r: Record<string, string> = {
    __TITLE__: `Flight Crew Briefing — ${briefing.overview.flightNumber}`,
    __FLIGHT_NUMBER__: briefing.overview.flightNumber,
    __ORIGIN__: briefing.overview.departure,
    __DESTINATION__: briefing.overview.arrival,
    __DATE__: briefing.overview.flightDate,
    __AIRCRAFT__: briefing.overview.aircraftType,
    __CREW__: briefing.overview.crewPosition,
    __STD__: briefing.overview.scheduledDeparture,
    __STA__: briefing.overview.scheduledArrival,
    __DEP_WX__: briefing.weather.departure.metar || "No METAR data",
    __DEP_TAF__: briefing.weather.departure.taf || "No TAF data",
    __ARR_WX__: briefing.weather.arrival.metar || "No METAR data",
    __ARR_TAF__: briefing.weather.arrival.taf || "No TAF data",
    __ROUTE__: `${briefing.route.departure} → ${briefing.route.arrival}`,
    __ALTN__: briefing.route.alternate ?? "N/A",
    __ALT__: briefing.route.filedAltitude || "N/A",
    __ETE__: briefing.route.estimatedTimeEnroute || "N/A",
    __FUEL__: briefing.route.fuelOnBoard || "N/A",
    __DIST__: briefing.route.distance || "N/A",
    __NOTAMS__: briefing.notams.departure.length + briefing.notams.arrival.length + briefing.notams.enroute.length > 0
      ? `${briefing.notams.departure.length + briefing.notams.arrival.length + briefing.notams.enroute.length} NOTAMs`
      : "No NOTAMs",
    __ALERTS__: briefing.alerts.items.length > 0
      ? briefing.alerts.items.map((a) => `${a.severity.toUpperCase()}: ${a.title}`).join("<br>")
      : "No alerts",
  };

  let html = tpl;
  for (const [k, v] of Object.entries(r)) html = html.replaceAll(k, v);
  return html;
}
