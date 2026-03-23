import { Router, type IRouter } from "express";
import { GetNextBusesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const LINE_ID = "STIF:Line::C01797:";
const STOP_FILTER = "Résistance";
const IDFM_API_URL = "https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable";

router.get("/bus/next", async (req, res) => {
  const apiKey = process.env["IDFM_API_KEY"];
  if (!apiKey) {
    req.log.error("IDFM_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error: API key missing" });
    return;
  }

  const url = new URL(IDFM_API_URL);
  url.searchParams.set("LineRef", LINE_ID);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(url.toString(), {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch from IDFM estimated-timetable API");
    res.status(502).json({ error: "Failed to reach upstream API" });
    return;
  }

  if (!upstreamRes.ok) {
    req.log.error({ status: upstreamRes.status }, "IDFM API returned error");
    res.status(502).json({ error: `Upstream API error: ${upstreamRes.status}` });
    return;
  }

  let data: unknown;
  try {
    data = await upstreamRes.json();
  } catch (err) {
    req.log.error({ err }, "Failed to parse IDFM API response");
    res.status(502).json({ error: "Invalid response from upstream API" });
    return;
  }

  const now = new Date();
  const departures: Array<{
    expectedArrivalTime: string;
    minutesUntilArrival: number;
    destination: string;
    formattedTime: string;
    vehicleRef: string;
  }> = [];

  try {
    const deliveries: any[] =
      (data as any)?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery ?? [];

    for (const delivery of deliveries) {
      const frames: any[] = delivery?.EstimatedJourneyVersionFrame ?? [];

      for (const frame of frames) {
        const vehicleJourneys: any[] = frame?.EstimatedVehicleJourney ?? [];

        for (const vj of vehicleJourneys) {
          const destination: string =
            vj?.DestinationName?.[0]?.value ?? "Inconnu";
          const vehicleRef: string = vj?.VehicleRef?.value ?? "";
          const calls: any[] = vj?.EstimatedCalls?.EstimatedCall ?? [];

          for (const call of calls) {
            const stopName: string =
              call?.StopPointName?.[0]?.value ?? "";

            if (!stopName.includes(STOP_FILTER)) continue;

            const timeStr: string =
              call?.ExpectedArrivalTime ??
              call?.AimedArrivalTime ??
              call?.ExpectedDepartureTime ??
              call?.AimedDepartureTime ??
              "";

            if (!timeStr) continue;

            const arrival = new Date(timeStr);

            // Skip departures more than 2 minutes in the past
            if ((arrival.getTime() - now.getTime()) / 60000 < -2) continue;

            const minutesUntilArrival = Math.round(
              (arrival.getTime() - now.getTime()) / 60000
            );
            const formattedTime = arrival.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
            });

            departures.push({
              expectedArrivalTime: timeStr,
              minutesUntilArrival,
              destination,
              formattedTime,
              vehicleRef,
            });
          }
        }
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Could not parse estimated timetable from IDFM response");
  }

  // Sort by arrival time ascending
  departures.sort(
    (a, b) =>
      new Date(a.expectedArrivalTime).getTime() -
      new Date(b.expectedArrivalTime).getTime()
  );

  const result = GetNextBusesResponse.parse({
    departures: departures.slice(0, 5),
    stopName: "Place de la Résistance",
    lastUpdated: now.toISOString(),
  });

  res.json(result);
});

export default router;
