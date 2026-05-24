import type { FlightCrewBriefing, WeatherStation, Notam, RouteWeather, CrewAlert } from "@paperclipai/shared";

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

interface RouteDef {
  departure: string;
  arrival: string;
  alternate: string;
  flightNumber: string;
  distance: string;
  filedAltitude: string;
  estimatedTimeEnroute: string;
  fuelOnBoard: string;
  aircraftType: string;
  departureTime: string;
  arrivalTime: string;
}

const ROUTES: RouteDef[] = [
  { departure: "KLAX", arrival: "KJFK", alternate: "KPHL", flightNumber: "CMF-417", distance: "2475 nm", filedAltitude: "FL370", estimatedTimeEnroute: "4:15", fuelOnBoard: "28500 lbs", aircraftType: "Boeing 737-800", departureTime: "14:30", arrivalTime: "22:45" },
  { departure: "KJFK", arrival: "KORD", alternate: "KMDW", flightNumber: "CMF-218", distance: "740 nm", filedAltitude: "FL320", estimatedTimeEnroute: "2:10", fuelOnBoard: "12000 lbs", aircraftType: "Airbus A320", departureTime: "07:15", arrivalTime: "10:25" },
  { departure: "KORD", arrival: "KDFW", alternate: "KDAL", flightNumber: "CMF-119", distance: "800 nm", filedAltitude: "FL340", estimatedTimeEnroute: "2:30", fuelOnBoard: "13500 lbs", aircraftType: "Boeing 737-700", departureTime: "11:00", arrivalTime: "14:30" },
  { departure: "KDFW", arrival: "KSEA", alternate: "KPDX", flightNumber: "CMF-322", distance: "1660 nm", filedAltitude: "FL360", estimatedTimeEnroute: "3:45", fuelOnBoard: "21000 lbs", aircraftType: "Boeing 737-800", departureTime: "16:00", arrivalTime: "20:45" },
  { departure: "KSEA", arrival: "KSFO", alternate: "KOAK", flightNumber: "CMF-504", distance: "590 nm", filedAltitude: "FL310", estimatedTimeEnroute: "1:50", fuelOnBoard: "10500 lbs", aircraftType: "Airbus A320", departureTime: "08:30", arrivalTime: "11:20" },
  { departure: "KSFO", arrival: "KLAX", alternate: "KBUR", flightNumber: "CMF-601", distance: "340 nm", filedAltitude: "FL280", estimatedTimeEnroute: "1:10", fuelOnBoard: "8500 lbs", aircraftType: "Boeing 737-700", departureTime: "13:00", arrivalTime: "15:10" },
  { departure: "KMIA", arrival: "KATL", alternate: "KJAX", flightNumber: "CMF-711", distance: "600 nm", filedAltitude: "FL330", estimatedTimeEnroute: "1:45", fuelOnBoard: "11000 lbs", aircraftType: "Boeing 737-700", departureTime: "09:00", arrivalTime: "11:45" },
  { departure: "KDEN", arrival: "KORD", alternate: "KMDW", flightNumber: "CMF-805", distance: "770 nm", filedAltitude: "FL350", estimatedTimeEnroute: "2:15", fuelOnBoard: "12500 lbs", aircraftType: "Airbus A320", departureTime: "15:30", arrivalTime: "18:45" },
];

const DEP_METARS: Record<string, string[]> = {
  KLAX: ["KLAX 251150Z 25008KT 10SM FEW025 BKN200 18/14 A2998"],
  KJFK: ["KJFK 251150Z 18012KT 6SM -RA BR OVC015 14/12 A2995"],
  KORD: ["KORD 251150Z 36008KT 10SM FEW040 SCT080 08/03 A3010"],
  KDFW: ["KDFW 251150Z 20010KT 10SM SCT035 22/18 A2990"],
  KSEA: ["KSEA 251150Z 21006KT 10SM FEW030 SCT060 12/08 A3005"],
  KSFO: ["KSFO 251150Z 28010KT 10SM FEW020 14/10 A2999"],
  KMIA: ["KMIA 251150Z 12010KT 10SM FEW025 SCT080 27/23 A2992"],
  KATL: ["KATL 251150Z 22008KT 10SM FEW050 SCT120 20/15 A2994"],
  KDEN: ["KDEN 251150Z 30015G25KT 10SM FEW060 SCT100 18/05 A2990"],
};

const DEP_TAFS: Record<string, string[]> = {
  KLAX: ["KLAX 251120Z 2512/2618 26010KT P6SM FEW025 BKN200 FM252000 26012G20KT P6SM FEW030"],
  KJFK: ["KJFK 251120Z 2512/2618 18012G20KT 5SM -RA BR OVC012 FM260000 22008KT P6SM BKN030"],
  KORD: ["KORD 251120Z 2512/2618 36006KT P6SM SCT040 BKN080"],
  KDFW: ["KDFW 251120Z 2512/2618 21012G20KT P6SM SCT040 BKN100"],
  KSEA: ["KSEA 251120Z 2512/2618 22008KT P6SM BKN050"],
  KSFO: ["KSFO 251120Z 2512/2618 29010KT P6SM FEW025"],
  KMIA: ["KMIA 251120Z 2512/2618 13012KT P6SM SCT030 BKN080"],
  KATL: ["KATL 251120Z 2512/2618 22010KT P6SM FEW050 SCT120"],
  KDEN: ["KDEN 251120Z 2512/2618 31015G25KT P6SM SCT060 BKN100"],
};

const ENROUTE_WX: RouteWeather[][] = [
  [
    { segment: "KLAX-KDMA", conditions: "Clear skies, light winds", severity: "low", details: "No significant weather" },
    { segment: "KDMA-KTUS", conditions: "Isolated cumulus, smooth ride", severity: "low", details: "Scattered clouds FL120-FL180" },
    { segment: "KTUS-KABQ", conditions: "Light chop forecast", severity: "low", details: "CAT possible FL250-FL350" },
    { segment: "KABQ-KICT", conditions: "Moderate turbulence over Rockies", severity: "medium", details: "Orographic waves FL280-FL360" },
    { segment: "KICT-KSTL", conditions: "Scattered thunderstorms developing", severity: "medium", details: "Isolated CB tops to FL400" },
    { segment: "KSTL-KJFK", conditions: "Line of CBs moving east", severity: "high", details: "Line of CB TOPS FL420 MOV E 25KT" },
  ],
  [
    { segment: "KJFK-KBOS", conditions: "Low clouds, IMC possible", severity: "medium", details: "Ceilings 1500-2500 ft" },
    { segment: "KBOS-KSYR", conditions: "Mixed icing conditions", severity: "medium", details: "Light icing FL080-FL160" },
    { segment: "KSYR-KORD", conditions: "Tailwind, smooth ride", severity: "low", details: "Westerly flow 40-50 kts" },
  ],
  [
    { segment: "KORD-KSTL", conditions: "Clear, smooth ride", severity: "low", details: "VMC throughout" },
    { segment: "KSTL-KDFW", conditions: "Some cumulus buildup", severity: "low", details: "Isolated showers south of route" },
  ],
  [
    { segment: "KDFW-KAMA", conditions: "Clear skies", severity: "low", details: "No significant weather" },
    { segment: "KAMA-KABQ", conditions: "Moderate turbulence", severity: "medium", details: "Mountain wave activity FL300-FL380" },
    { segment: "KABQ-KPUB", conditions: "Light chop, clear", severity: "low", details: "Smooth above FL320" },
    { segment: "KPUB-KSEA", conditions: "Frontal passage, deteriorating", severity: "high", details: "Widespread rain and IMC possible" },
  ],
  [
    { segment: "KSEA-KPDX", conditions: "Low overcast, light rain", severity: "medium", details: "Ceilings 1000-2000 ft" },
    { segment: "KPDX-KSFO", conditions: "Improving conditions southbound", severity: "low", details: "Gradual clearing" },
  ],
  [
    { segment: "KSFO-KSBP", conditions: "Marine layer, clearing", severity: "low", details: "Stratus burning off by 16Z" },
    { segment: "KSBP-KLAX", conditions: "Clear, smooth", severity: "low", details: "CAVU" },
  ],
  [
    { segment: "KMIA-KJAX", conditions: "Scattered thunderstorms", severity: "medium", details: "Afternoon convection typical" },
    { segment: "KJAX-KATL", conditions: "Building cumulus", severity: "low", details: "Isolated showers possible" },
  ],
  [
    { segment: "KDEN-KLBF", conditions: "Clear, windy", severity: "low", details: "Surface winds gusting 25 kts" },
    { segment: "KLBF-KORD", conditions: "Moderate chop", severity: "medium", details: "Frontal boundary crossing route" },
  ],
];

const NOTAM_TEMPLATES: { type: string; description: string; severity: "low" | "medium" | "high" }[][] = [
  [
    { type: "Airport", description: "RWY 24L/06R CLSD DUE TO WIP", severity: "high" },
    { type: "Airport", description: "RWY 13R/31L GROUND MOVEMENT RESTRICTED", severity: "medium" },
    { type: "Enroute", description: "AIRSPACE RESERVATION OVER MOJAVE", severity: "high" },
    { type: "Enroute", description: "NAV AID VOR/DME JOT U/S", severity: "medium" },
  ],
  [
    { type: "Airport", description: "ILS 13L OUT OF SERVICE", severity: "high" },
    { type: "Airport", description: "APRON B NORTH SECTION CLOSED", severity: "low" },
    { type: "Enroute", description: "ATC FREQ 118.5 OUT OF SERVICE", severity: "medium" },
  ],
  [
    { type: "Airport", description: "PAPI RWY 27R U/S", severity: "medium" },
    { type: "Enroute", description: "MOA ACTIVE FL180-FL350 15Z-19Z", severity: "high" },
    { type: "Airport", description: "DEICING PAD CLOSED", severity: "low" },
  ],
  [
    { type: "Airport", description: "RWY 18/36 SHOULDER WORK IN PROGRESS", severity: "low" },
    { type: "Enroute", description: "TEMPORARY FLIGHT RESTRICTIONS", severity: "medium" },
    { type: "Airport", description: "EMERGENCY EQUIPMENT DRILL ON AIRFIELD", severity: "low" },
  ],
  [
    { type: "Airport", description: "SIGMET FOR ICING FL080-FL160", severity: "high" },
    { type: "Enroute", description: "NAV AID VOR/DNE ABQ U/S", severity: "medium" },
    { type: "Airport", description: "REIL RWY 12 INOP", severity: "low" },
  ],
  [
    { type: "Airport", description: "ASDE-X OUT OF SERVICE", severity: "medium" },
    { type: "Enroute", description: "AIRWAY V459 SEGMENT CLOSED", severity: "low" },
    { type: "Airport", description: "DEICING PAD OPEN BY REQUEST ONLY", severity: "low" },
  ],
  [
    { type: "Airport", description: "CONSTRUCTION N OF RWY 9/27 LIGHTS U/S", severity: "low" },
    { type: "Enroute", description: "WIDESPREAD CONVECTION FORECAST", severity: "high" },
    { type: "Airport", description: "EMAS INSTALLED BOTH ENDS RWY 10/28", severity: "low" },
  ],
  [
    { type: "Airport", description: "VASI RWY 16R OUT OF SERVICE", severity: "low" },
    { type: "Enroute", description: "ATC RADAR COVERAGE LIMITED BELOW 5000 AGL", severity: "medium" },
    { type: "Airport", description: "SNOW REMOVAL IN PROGRESS EAST RAMP", severity: "low" },
  ],
];

const ALERT_TEMPLATES: CrewAlert[][] = [
  [
    { id: "ALT-WX-001", type: "weather", title: "Arrival crosswind advisory", description: "Crosswind 12G20 knots after 2000Z", severity: "warning" },
    { id: "ALT-JET-001", type: "weather", title: "Jet stream advisory", description: "Strong upper-level winds at FL370", severity: "info" },
  ],
  [
    { id: "ALT-WX-002", type: "weather", title: "Low ceilings at arrival", description: "Ceilings OVC012, anticipate ILS approach", severity: "warning" },
  ],
  [
    { id: "ALT-WX-003", type: "weather", title: "Icing conditions enroute", description: "Light icing in clouds FL080-FL160", severity: "warning" },
  ],
  [
    { id: "ALT-WX-004", type: "weather", title: "Thunderstorms along route", description: "Line of CBs moving east, tops FL420", severity: "critical" },
    { id: "ALT-FUEL-001", type: "fuel", title: "Fuel planning advisory", description: "Check alternate fuel requirements", severity: "warning" },
  ],
  [
    { id: "ALT-WX-005", type: "weather", title: "Mountain wave turbulence", description: "Moderate turbulence forecast over Rockies", severity: "warning" },
  ],
  [
    { id: "ALT-WX-006", type: "weather", title: "Frontal passage at arrival", description: "Gusty winds and rain possible at KSFO", severity: "warning" },
  ],
  [
    { id: "ALT-WX-007", type: "weather", title: "Afternoon convection", description: "Scattered thunderstorms at KMIA", severity: "warning" },
  ],
  [
    { id: "ALT-WX-008", type: "weather", title: "Surface winds gusting", description: "Gusty winds at KDEN, crosswind check required", severity: "warning" },
  ],
];

function makeStation(code: string, seed: number): WeatherStation {
  const metarOptions = DEP_METARS[code] || [`${code} 251150Z 00000KT 10SM FEW025 15/10 A2992`];
  const tafOptions = DEP_TAFS[code] || [`${code} 251120Z 2512/2618 00000KT P6SM FEW025`];
  return { station: code, metar: metarOptions[seed % metarOptions.length], taf: tafOptions[seed % tafOptions.length] };
}

function dateString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function overview(route: RouteDef, seed: number, dutyDayId: string): FlightCrewBriefing["overview"] {
  const positions = ["Captain", "First Officer", "Relief Pilot"];
  const dayOffset = (hashSeed(dutyDayId) % 14) - 7;
  return {
    flightDate: dateString(dayOffset),
    departure: route.departure,
    arrival: route.arrival,
    aircraftType: route.aircraftType,
    flightNumber: route.flightNumber,
    crewPosition: pick(positions, seed),
    scheduledDeparture: `${route.departureTime} UTC`,
    scheduledArrival: `${route.arrivalTime} UTC`,
  };
}

function weather(route: RouteDef, seed: number): FlightCrewBriefing["weather"] {
  const depWx = makeStation(route.departure, seed);
  const arrWx = makeStation(route.arrival, seed + 1);
  const altWx: WeatherStation | null = route.alternate ? makeStation(route.alternate, seed + 2) : null;
  const routeIdx = ROUTES.indexOf(route);
  return { departure: depWx, arrival: arrWx, alternate: altWx, enroute: ENROUTE_WX[routeIdx] ?? ENROUTE_WX[0] };
}

function notams(route: RouteDef, seed: number): FlightCrewBriefing["notams"] {
  const routeIdx = ROUTES.indexOf(route);
  const templates = NOTAM_TEMPLATES[routeIdx] ?? NOTAM_TEMPLATES[0];
  const hour = 6 + (seed % 12);
  const sh = String(hour).padStart(2, "0");
  const eh = String((hour + 6) % 24).padStart(2, "0");
  const ds = dateString(0);

  return {
    departure: templates.map((t, i) => ({
      id: `N${String(i + 1).padStart(3, "0")}`,
      location: route.departure, type: t.type,
      description: t.description, severity: t.severity,
      startTime: `${ds}T${sh}:00Z`, endTime: `${ds}T${eh}:00Z`,
    })),
    arrival: templates.slice(1).map((t, i) => ({
      id: `N${String(i + 4).padStart(3, "0")}`,
      location: route.arrival, type: t.type,
      description: t.description, severity: t.severity,
      startTime: `${ds}T${sh}:00Z`, endTime: `${ds}T${eh}:00Z`,
    })),
    enroute: [],
  };
}

function routeSection(route: RouteDef): FlightCrewBriefing["route"] {
  return {
    departure: route.departure, arrival: route.arrival,
    alternate: route.alternate || null,
    filedAltitude: route.filedAltitude,
    estimatedTimeEnroute: route.estimatedTimeEnroute,
    fuelOnBoard: route.fuelOnBoard, distance: route.distance,
  };
}

function alerts(route: RouteDef, seed: number): FlightCrewBriefing["alerts"] {
  const routeIdx = ROUTES.indexOf(route);
  return { items: [...(ALERT_TEMPLATES[routeIdx] ?? ALERT_TEMPLATES[0])] };
}

export function briefingGenerationService() {
  function generate(tripId: string, dutyDayId: string): FlightCrewBriefing {
    const seed = hashSeed(`${tripId}:${dutyDayId}`);
    const route = pick(ROUTES, seed);
    const r: RouteDef = { ...route, flightNumber: `CMF-${(seed % 900 + 100)}` };
    return {
      tripId, dutyDayId,
      overview: overview(r, seed, dutyDayId),
      weather: weather(route, seed),
      notams: notams(route, seed),
      route: routeSection(route),
      alerts: alerts(route, seed),
    };
  }
  return { generate };
}

export type BriefingGenerationService = ReturnType<typeof briefingGenerationService>;
