import { Router, type IRouter } from "express";
import { GetNextBusesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const LINE_ID = "STIF:Line::C01217:";
const STOP_FILTER = "Résistance";
const PRIM_API_URL = "https://prim.iledefrance-mobilites.fr/marketplace/requete-ligne";
const API_URL = "https://api.iledefrance-mobilites.fr/marketplace/requete-ligne";

// Fallback stop IDs for "Place de la Résistance - Charles de Gaulle" in Bourg-la-Reine.
// Used when the API doesn't return StopPointName (prim gateway limitation).
// Q:40335 = direction Massy (ASM), Q:40334 = direction Porte d'Orléans (PDO).
const FALLBACK_STOP_IDS_ASM = new Set([
  "STIF:StopPoint:Q:40335:",
]);
const FALLBACK_STOP_IDS_PDO = new Set([
  "STIF:StopPoint:Q:40334:",
]);

type Departure = {
  expectedArrivalTime: string;
  minutesUntilArrival: number;
  destination: string;
  formattedTime: string;
  vehicleRef: string;
  direction: string;
};

function isPDO(destinationName: string): boolean {
  const lower = destinationName.toLowerCase();
  return (
    lower.includes("orl") ||
    lower.includes("porte") ||
    lower.includes("denfert") ||
    lower.includes("bagneux")
  );
}

async function fetchIdfm(url: string, apiKey: string): Promise<unknown> {
  const fullUrl = new URL(url);
  fullUrl.searchParams.set("LineRef", LINE_ID);

  const res = await fetch(fullUrl.toString(), {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseDepartures(data: unknown, now: Date): Departure[] {
  const departures: Departure[] = [];

  const deliveries: any[] =
    (data as any)?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery ?? [];

  for (const delivery of deliveries) {
    for (const frame of delivery?.EstimatedJourneyVersionFrame ?? []) {
      for (const vj of frame?.EstimatedVehicleJourney ?? []) {
        const destinationName: string =
          vj?.DestinationName?.[0]?.value ?? "Inconnu";
        // VehicleRef is not provided by prim; extract trip number from DatedVehicleJourneyRef
        // e.g. "MeC_Bus_PC:VehicleJourney::20260324.22.A.C01217:LOC" → "22"
        const rawJourneyRef: string = vj?.DatedVehicleJourneyRef?.value ?? "";
        const tripMatch = rawJourneyRef.match(/\d{8}\.(\d+)\./);
        const vehicleRef: string = tripMatch ? tripMatch[1] : "";
        const calls: any[] = vj?.EstimatedCalls?.EstimatedCall ?? [];
        const direction = isPDO(destinationName) ? "PDO" : "ASM";
        const fallbackStopIds =
          direction === "PDO" ? FALLBACK_STOP_IDS_PDO : FALLBACK_STOP_IDS_ASM;

        for (const call of calls) {
          const stopName: string = call?.StopPointName?.[0]?.value ?? "";
          const stopRef: string = call?.StopPointRef?.value ?? "";

          // Primary filter: match by stop name (works with api. gateway)
          // Fallback filter: match by hardcoded stop ref (used with prim gateway)
          const matchesStop =
            stopName.includes(STOP_FILTER) || fallbackStopIds.has(stopRef);

          if (!matchesStop) continue;

          const timeStr: string =
            call?.ExpectedArrivalTime ??
            call?.AimedArrivalTime ??
            call?.ExpectedDepartureTime ??
            call?.AimedDepartureTime ??
            "";

          if (!timeStr) continue;

          const arrival = new Date(timeStr);
          const minutesUntilArrival = Math.round(
            (arrival.getTime() - now.getTime()) / 60000
          );

          if (minutesUntilArrival < -2) continue;

          const formattedTime = arrival.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Paris",
          });

          departures.push({
            expectedArrivalTime: timeStr,
            minutesUntilArrival,
            destination: destinationName,
            formattedTime,
            vehicleRef,
            direction,
          });
        }
      }
    }
  }

  return departures;
}

router.get("/bus/next", async (req, res) => {
  const apiKey = process.env["IDFM_API_KEY"];
  if (!apiKey) {
    req.log.error("IDFM_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error: API key missing" });
    return;
  }

  const now = new Date();
  let data: unknown = null;

  // Try api.iledefrance-mobilites.fr first (returns StopPointName), then prim as fallback
  try {
    data = await fetchIdfm(API_URL, apiKey);
    req.log.info("Fetched from api.iledefrance-mobilites.fr");
  } catch (_err) {
    try {
      data = await fetchIdfm(PRIM_API_URL, apiKey);
      req.log.info("Fetched from prim.iledefrance-mobilites.fr (fallback)");
    } catch (err) {
      req.log.error({ err }, "Failed to fetch from both IDFM API endpoints");
      res.status(502).json({ error: "Impossible de joindre l'API Île-de-France Mobilités" });
      return;
    }
  }

  let allDepartures: Departure[] = [];
  try {
    allDepartures = parseDepartures(data, now);
  } catch (err) {
    req.log.warn({ err }, "Could not parse IDFM response");
  }

  allDepartures.sort(
    (a, b) =>
      new Date(a.expectedArrivalTime).getTime() -
      new Date(b.expectedArrivalTime).getTime()
  );

  const towardsPDO = allDepartures.filter((d) => d.direction === "PDO").slice(0, 3);
  const towardsASM = allDepartures.filter((d) => d.direction === "ASM").slice(0, 3);

  const result = GetNextBusesResponse.parse({
    towardsPDO,
    towardsASM,
    stopName: "Place de la Résistance - Charles de Gaulle",
    lastUpdated: now.toISOString(),
  });

  res.json(result);
});

export default router;
