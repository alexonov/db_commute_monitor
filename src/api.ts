import { NormalizedDeparture, Departure } from './types';

const MIRRORS = [
  'https://v6.db.transport.rest',
  'https://v5.db.transport.rest',
  'https://db.transport.rest',
  'https://v6.hvv.transport.rest',
  'https://v5.hvv.transport.rest'
];

async function mirrorFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  let lastError: any = null;
  
  for (const host of MIRRORS) {
    try {
      const url = new URL(`${host}/${path}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s per mirror
      
      console.log(`[API] Trying mirror: ${host}...`);
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        return await res.json();
      }
      lastError = new Error(`Mirror ${host} returned ${res.status}`);
    } catch (e: any) {
      console.warn(`[API] Mirror ${host} failed:`, e.name === 'AbortError' ? 'Timeout' : e.message);
      lastError = e;
    }
  }
  throw lastError || new Error('All mirrors failed');
}

export async function searchStations(query: string) {
  if (!query || query.length < 2) return [];
  try {
    const data = await mirrorFetch('locations', {
      query,
      results: '5',
      stops: 'true',
      address: 'false',
      poi: 'false'
    });
    return Array.isArray(data) ? data : (data.locations || []);
  } catch (err) {
    console.error('[API] Search error:', err);
    return [];
  }
}

export async function getDepartures(fromId: string, toId: string): Promise<NormalizedDeparture[]> {
  if (!fromId || !toId) return [];

  const sFrom = String(fromId).trim();
  const sTo = String(toId).trim();

  if (!sFrom || !sTo) {
    throw new Error('Invalid station selection');
  }

  try {
    console.log(`[API] Looking up route: ${sFrom} -> ${sTo}`);
    
    // Attempt 1: Journeys
    try {
      const jData = await mirrorFetch('journeys', {
        from: sFrom,
        to: sTo,
        results: '10',
        stopovers: 'false',
        remarks: 'false',
        polylines: 'false'
      });
      
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
    } catch (jErr) {
      console.warn('[API] Journeys fallback:', jErr);
    }

    // Attempt 2: Departures Fallback
    console.warn(`[API] Trying departures...`);
    const dData = await mirrorFetch(`stops/${encodeURIComponent(sFrom)}/departures`, {
      duration: '120',
      results: '20',
      stopovers: 'true',
      remarks: 'false'
    });
    
    const raw = Array.isArray(dData) ? dData : (dData.departures || []);
    const matches = raw.filter(d => filterByDestination(d, sTo));
    
    if (matches.length > 0) return matches.map((d, index) => normalizeDeparture(d, index));

    throw new Error('No upcoming trains found');
  } catch (err: any) {
    console.error('[API] getDepartures failed:', err.message || err);
    throw new Error('Connection error. Please try again in a moment.');
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
