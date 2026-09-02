import type { SFSymbol } from 'expo-symbols';

export type UnitSystem = 'metric' | 'imperial';

export type ComparisonMetric =
  | 'temperature'
  | 'apparent'
  | 'rain'
  | 'humidity'
  | 'wind'
  | 'high'
  | 'low';

export interface LocationSelection {
  id?: number;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  admin1?: string;
  timezone?: string;
  source: 'search' | 'geolocation';
}

export interface HourlyPoint {
  time: string;
  temperatureC: number | null;
  apparentC: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  rainMm: number | null;
  windKmh: number | null;
  weatherCode: number | null;
  isDay: boolean;
}

export interface DailyPoint {
  date: string;
  weatherCode: number | null;
  highC: number | null;
  lowC: number | null;
  precipitationProbabilityMax: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherSnapshot {
  timezone: string;
  timezoneAbbreviation: string;
  current: HourlyPoint;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  fetchedAt: string;
}

export interface ComparisonResult {
  metric: ComparisonMetric;
  current: number;
  baseline: number | null;
  delta: number | null;
  direction: 'up' | 'down' | 'same';
  significant: boolean;
  score: number;
  displayCopy: string;
}

export interface AdviceAction {
  kind: 'umbrella' | 'layers' | 'sun' | 'heat' | 'wind';
  title: string;
  detail: string;
  symbol: SFSymbol;
  tone: 'blue' | 'green' | 'orange';
}

export interface PracticalAdvice {
  headline: string;
  summary: string | null;
  comparisonLine: string | null;
  rainLine: string | null;
  quietLine: string | null;
  actions: AdviceAction[];
}
