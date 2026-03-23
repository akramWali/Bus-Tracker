import { Router, type IRouter } from "express";
import { GetNextBusesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const STOP_ID = "STIF:StopPoint:Q:43135:";
const LINE_ID = "STIF:Line::C01797:";
const IDFM_API_URL = "https://api.iledefrance-mobilites.fr/marketplace/stop-monitoring";

router.get("/bus/next", async (req, res) => {
  const apiKey = process.env["IDFM_API_KEY"];
  if (!apiKey) {
    req.log.error("IDFM_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error: API key missing" });
    return;
  }

  const url = new URL(IDFM_API_URL);
  url.searchParams.set("MonitoringRef", STOP_ID);
  url.searchParams.set("LineRef", LINE_ID);
  url.searchParams.set("MaximumStopVisits", "5");

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(url.toString(), {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch from IDFM API");
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

  let visits: any[] = [];
  let stopName = "Place de la Résistance";

  try {
    const siri = (data as any)?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
    if (siri) {
      visits = siri.MonitoredStopVisit ?? [];
      const firstVisit = visits[0];
      if (firstVisit) {
        const monitoredName = firstVisit?.MonitoredVehicleJourney?.MonitoredCall?.StopPointName?.[0]?.value;
        if (monitoredName) stopName = monitoredName;
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Could not parse stop visits from IDFM response");
  }

  const now = new Date();

  const departures = visits.map((visit: any) => {
    const journey = visit?.MonitoredVehicleJourney;
    const destination: string = journey?.DestinationName?.[0]?.value ?? "Inconnu";
    const timeStr: string =
      journey?.MonitoredCall?.ExpectedArrivalTime ??
      journey?.MonitoredCall?.AimedArrivalTime ??
      journey?.MonitoredCall?.ExpectedDepartureTime ??
      journey?.MonitoredCall?.AimedDepartureTime ??
      "";
    const vehicleRef: string = journey?.VehicleRef?.value ?? "";

    let expectedArrivalTime = timeStr;
    let minutesUntilArrival = 0;
    let formattedTime = "--:--";

    if (timeStr) {
      const arrival = new Date(timeStr);
      minutesUntilArrival = Math.round((arrival.getTime() - now.getTime()) / 60000);
      formattedTime = arrival.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      });
    }

    return {
      expectedArrivalTime,
      minutesUntilArrival,
      destination,
      formattedTime,
      vehicleRef,
    };
  });

  const result = GetNextBusesResponse.parse({
    departures,
    stopName,
    lastUpdated: now.toISOString(),
  });

  res.json(result);
});

export default router;
