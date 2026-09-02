import { normalizeWeather, type OpenMeteoResponse } from '../domain/weather';
import type { LocationSelection, WeatherSnapshot } from '../domain/types';

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export async function fetchWeather(
  location: LocationSelection,
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    past_days: '1',
    forecast_days: '7',
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation_probability',
      'rain',
      'wind_speed_10m',
      'weather_code',
      'is_day',
    ].join(','),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation_probability',
      'rain',
      'wind_speed_10m',
      'weather_code',
      'is_day',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'uv_index_max',
      'sunrise',
      'sunset',
    ].join(','),
  });

  const response = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Weather is unavailable right now.');
  return normalizeWeather(await response.json() as OpenMeteoResponse);
}

function toLocation(result: GeocodingResult): LocationSelection {
  const displayParts = [result.name];
  if (result.admin1 && result.admin1 !== result.name) displayParts.push(result.admin1);
  if (result.country) displayParts.push(result.country);
  return {
    id: result.id,
    name: result.name,
    displayName: displayParts.join(', '),
    latitude: result.latitude,
    longitude: result.longitude,
    country: result.country,
    countryCode: result.country_code,
    admin1: result.admin1,
    timezone: result.timezone,
    source: 'search',
  };
}

export async function searchLocations(
  query: string,
  language = 'en',
  signal?: AbortSignal,
): Promise<LocationSelection[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    count: '8',
    language: language.split('-')[0] || 'en',
    format: 'json',
  });
  const response = await fetch(`${GEOCODING_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('City search is unavailable.');
  const data = await response.json() as { results?: GeocodingResult[] };
  return (data.results ?? [])
    .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
    .map(toLocation);
}
