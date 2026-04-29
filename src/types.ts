export interface Station {
  id: string;
  name: string;
}

export interface Commute {
  id: string;
  from: Station;
  to: Station;
}

export interface Config {
  commutes: Commute[];
}

export interface Departure {
  id?: string;
  line: {
    name: string;
    mode?: string;
  };
  direction: string;
  plannedDeparture: string;
  when: string | null;
  delay: number | null;
  platform: string | null;
  plannedPlatform: string | null;
  cancelled?: boolean;
  destination: {
    id: string;
    name: string;
  };
  stopovers?: {
    stop: {
      id: string;
      name: string;
    };
  }[];
}

export interface NormalizedDeparture {
  id: string;
  line: string;
  direction: string;
  plannedDeparture: string;
  actualDeparture: string;
  delay: number;
  platform: string;
  isCancelled: boolean;
  isPlatformChange: boolean;
  plannedPlatform: string;
}
