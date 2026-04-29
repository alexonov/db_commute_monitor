import { NormalizedDeparture, Departure } from './types';

const API_BASE = '/api/db';

export async function searchStations(query: string) {
  if (!query || query.length < 2) return [];
  try {
    const url = `${API_BASE}/locations?query=${encodeURIComponent(query)}&results=5&stops=true&address=false&poi=false`;
    console.log(`[API] Searching: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
       const err = await response.json().catch(() => ({}));
       console.error('[API] Search failed:', response.status, err);
       return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.locations || []);
  } catch (err) {
    console.error('[API] Search connection error:', err);
    return [];
  }
}

export async function getDepartures(fromId: string, toId: string): Promise<NormalizedDeparture[]> {
  if (!fromId || !toId) return [];

  // ID cleansing - keep only digits as these are expected to be EVA IDs (80XXXXX)
  // but allow non-numeric if they are HAFAS internal IDs
  const sFrom = String(fromId).trim();
  const sTo = String(toId).trim();

  if (!sFrom || !sTo) {
    throw new Error('Invalid station selection');
  }

  try {
    console.log(`[API] Looking up route: ${sFrom} -> ${sTo}`);
    
    // Attempt 1: Journeys (Most reliable for point-to-point)
    const journeyUrl = new URL(`${window.location.origin}${API_BASE}/journeys`);
    journeyUrl.searchParams.set('from', sFrom);
    journeyUrl.searchParams.set('to', sTo);
    journeyUrl.searchParams.set('results', '10');
    journeyUrl.searchParams.set('stopovers', 'false');
    journeyUrl.searchParams.set('remarks', 'false');
    journeyUrl.searchParams.set('polylines', 'false');
    
    console.log(`[API] Fetching journeys: ${journeyUrl.pathname}${journeyUrl.search}`);
    const jRes = await fetch(journeyUrl.toString());
    if (jRes.ok) {
      const jData = await jRes.json();
      const journeys = jData.journeys || [];
      
      const results = journeys.map((j: any, index: number) => {
        const leg = (j.legs || []).find((l: any) => l.departure && l.line);
        if (!leg) return null;
        
        return {
          id: `${j.refreshToken || Math.random()}-${index}`,
          line: leg.line?.name || 'TRAIN',
          direction: leg.direction || 'Destination',
          plannedDeparture: leg.plannedDeparture || leg.departure,
          actualDeparture: leg.departure || leg.plannedDeparture,
          delay: typeof leg.departureDelay === 'number' ? Math.round(leg.departureDelay / 60) : 0,
          platform: leg.platform || leg.plannedPlatform || '-',
          plannedPlatform: leg.plannedPlatform || '-',
          isCancelled: leg.cancelled === true,
          isPlatformChange: !!(leg.platform && leg.plannedPlatform && leg.platform !== leg.plannedPlatform)
        };
      }).filter(Boolean);
      
      if (results.length > 0) return results as NormalizedDeparture[];
    } else {
      const jErrText = await jRes.text().catch(() => 'Unknown error');
      console.warn(`[API] Journey fetch failed: ${jRes.status} ${jErrText.substring(0, 100)}`);
    }

    // Attempt 2: Departures Fallback
    console.warn(`[API] Journeys yielded no upcoming results, trying primary station departures...`);
    const depUrl = new URL(`${window.location.origin}${API_BASE}/stops/${encodeURIComponent(sFrom)}/departures`);
    depUrl.searchParams.set('duration', '120');
    depUrl.searchParams.set('results', '20');
    depUrl.searchParams.set('stopovers', 'true');
    depUrl.searchParams.set('remarks', 'false');

    console.log(`[API] Fetching departures: ${depUrl.pathname}${depUrl.search}`);
    const dRes = await fetch(depUrl.toString());
    
    if (dRes.ok) {
      const dData = await dRes.json();
      const raw = Array.isArray(dData) ? dData : (dData.departures || []);
      const matches = raw.filter(d => filterByDestination(d, sTo));
      
      if (matches.length > 0) return matches.map((d, index) => normalizeDeparture(d, index));
    } else {
      const dErrText = await dRes.text().catch(() => 'Unknown error');
      console.warn(`[API] Departures fetch failed: ${dRes.status} ${dErrText.substring(0, 100)}`);
    }

    throw new Error('No upcoming trains found for this route');
  } catch (err: any) {
    console.error('[API] getDepartures failed:', err.message || err);
    throw new Error(err.message?.includes('overloaded') ? 'Server busy, retrying...' : (err.message || 'Connection error'));
  }
}

function filterByDestination(dep: Departure, toId: string): boolean {
  // 1. Direct match: The final destination is our target
  if (dep.destination?.id === toId) return true;
  
  // 2. Stopover match: The target station is on the route
  if (dep.stopovers && Array.isArray(dep.stopovers)) {
    return dep.stopovers.some(stop => stop.stop?.id === toId);
  }
  
  return false;
}

function normalizeDeparture(dep: Departure, index: number): NormalizedDeparture {
  const plannedStr = dep.plannedDeparture || dep.when;
  const actualStr = dep.when || dep.plannedDeparture;
  
  const delay = typeof dep.delay === 'number' ? Math.round(dep.delay / 60) : 0;

  return {
    id: `${dep.id || 'dep'}-${index}-${plannedStr}`,
    line: dep.line?.name || 'Train',
    direction: dep.direction || 'Unknown',
    plannedDeparture: plannedStr || new Date().toISOString(),
    actualDeparture: actualStr || new Date().toISOString(),
    delay: delay,
    platform: dep.platform || dep.plannedPlatform || '-',
    plannedPlatform: dep.plannedPlatform || '-',
    isCancelled: dep.cancelled === true,
    isPlatformChange: !!(dep.platform && dep.plannedPlatform && dep.platform !== dep.plannedPlatform)
  };
}
