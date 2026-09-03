import type {
  ComparisonMetric,
  ComparisonResult,
  DailyPoint,
  HourlyPoint,
  PracticalAdvice,
  UnitSystem,
  WeatherSnapshot,
} from './types';

export interface OpenMeteoResponse {
  timezone?: string;
  timezone_abbreviation?: string;
  current?: {
    time?: string;
    temperature_2m?: number | null;
    apparent_temperature?: number | null;
    relative_humidity_2m?: number | null;
    precipitation_probability?: number | null;
    rain?: number | null;
    wind_speed_10m?: number | null;
    weather_code?: number | null;
    is_day?: number | null;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    apparent_temperature?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    rain?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
    is_day?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    weather_code?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    uv_index_max?: Array<number | null>;
    sunrise?: Array<string | null>;
    sunset?: Array<string | null>;
  };
}

export interface DerivedWeather {
  yesterdayHour: HourlyPoint | null;
  today: DailyPoint | null;
  yesterday: DailyPoint | null;
  temperature: ComparisonResult | null;
  apparent: ComparisonResult | null;
  rain: ComparisonResult | null;
  humidity: ComparisonResult | null;
  wind: ComparisonResult | null;
  high: ComparisonResult | null;
  low: ComparisonResult | null;
  headline: ComparisonResult | null;
  next24: HourlyPoint[];
  next7: DailyPoint[];
}

const thresholds: Record<ComparisonMetric, number> = {
  temperature: 1,
  apparent: 1,
  rain: 10,
  humidity: 5,
  wind: 5,
  high: 1,
  low: 1,
};

const directionWords: Record<ComparisonMetric, { up: string; down: string }> = {
  temperature: { up: 'warmer', down: 'cooler' },
  apparent: { up: 'warmer', down: 'cooler' },
  rain: { up: 'more likely', down: 'less likely' },
  humidity: { up: 'more humid', down: 'less humid' },
  wind: { up: 'windier', down: 'calmer' },
  high: { up: 'higher', down: 'lower' },
  low: { up: 'higher', down: 'lower' },
};

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeWeather(data: OpenMeteoResponse): WeatherSnapshot {
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  if (!current?.time || !hourly?.time?.length || !daily?.time?.length) {
    throw new Error('The weather service returned incomplete data.');
  }

  const hourlyPoints = hourly.time.map((time, index): HourlyPoint => ({
    time,
    temperatureC: numberOrNull(hourly.temperature_2m?.[index]),
    apparentC: numberOrNull(hourly.apparent_temperature?.[index]),
    humidity: numberOrNull(hourly.relative_humidity_2m?.[index]),
    precipitationProbability: numberOrNull(hourly.precipitation_probability?.[index]),
    rainMm: numberOrNull(hourly.rain?.[index]),
    windKmh: numberOrNull(hourly.wind_speed_10m?.[index]),
    weatherCode: numberOrNull(hourly.weather_code?.[index]),
    isDay: hourly.is_day?.[index] !== 0,
  }));

  const dailyPoints = daily.time.map((date, index): DailyPoint => ({
    date,
    weatherCode: numberOrNull(daily.weather_code?.[index]),
    highC: numberOrNull(daily.temperature_2m_max?.[index]),
    lowC: numberOrNull(daily.temperature_2m_min?.[index]),
    precipitationProbabilityMax: numberOrNull(daily.precipitation_probability_max?.[index]),
    uvIndexMax: numberOrNull(daily.uv_index_max?.[index]),
    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
  }));

  return {
    timezone: data.timezone || 'auto',
    timezoneAbbreviation: data.timezone_abbreviation || '',
    current: {
      time: current.time,
      temperatureC: numberOrNull(current.temperature_2m),
      apparentC: numberOrNull(current.apparent_temperature),
      humidity: numberOrNull(current.relative_humidity_2m),
      precipitationProbability: numberOrNull(current.precipitation_probability),
      rainMm: numberOrNull(current.rain),
      windKmh: numberOrNull(current.wind_speed_10m),
      weatherCode: numberOrNull(current.weather_code),
      isDay: current.is_day !== 0,
    },
    hourly: hourlyPoints,
    daily: dailyPoints,
    fetchedAt: new Date().toISOString(),
  };
}

export function previousLocalDayTime(isoLocal: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?/.exec(isoLocal);
  if (!match) throw new Error(`Invalid local date-time: ${isoLocal}`);

  const [, year, month, day, hour, minute = '00'] = match;
  const previous = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return `${previous.toISOString().slice(0, 10)}T${hour}:${minute}`;
}

export function hourKey(isoLocal: string): string {
  return `${isoLocal.slice(0, 13)}:00`;
}

export function findPreviousDayPoint(points: HourlyPoint[], time: string): HourlyPoint | null {
  const target = previousLocalDayTime(hourKey(time));
  return points.find((point) => hourKey(point.time) === target) ?? null;
}

export function celsiusToFahrenheit(value: number): number {
  return value * 9 / 5 + 32;
}

export function kmhToMph(value: number): number {
  return value * 0.621371;
}

export function formatTemperature(valueC: number | null, units: UnitSystem): string {
  if (valueC === null) return '—';
  const value = units === 'imperial' ? celsiusToFahrenheit(valueC) : valueC;
  return `${Math.round(value)}°`;
}

export function formatWind(valueKmh: number | null, units: UnitSystem): string {
  if (valueKmh === null) return '—';
  const value = units === 'imperial' ? kmhToMph(valueKmh) : valueKmh;
  return `${Math.round(value)} ${units === 'imperial' ? 'mph' : 'km/h'}`;
}

function formatDelta(metric: ComparisonMetric, delta: number, units: UnitSystem): string {
  const absolute = Math.abs(delta);
  if (['temperature', 'apparent', 'high', 'low'].includes(metric)) {
    const value = units === 'imperial' ? absolute * 9 / 5 : absolute;
    return `${Math.max(1, Math.round(value))}°`;
  }
  if (metric === 'wind') {
    const value = units === 'imperial' ? kmhToMph(absolute) : absolute;
    return `${Math.max(1, Math.round(value))} ${units === 'imperial' ? 'mph' : 'km/h'}`;
  }
  return `${Math.round(absolute)} points`;
}

export function buildComparison(
  metric: ComparisonMetric,
  current: number | null,
  baseline: number | null,
  units: UnitSystem,
): ComparisonResult | null {
  if (current === null) return null;
  if (baseline === null) {
    return {
      metric,
      current,
      baseline,
      delta: null,
      direction: 'same',
      significant: false,
      score: 0,
      displayCopy: 'No comparison yet',
    };
  }

  const delta = current - baseline;
  const significant = Math.abs(delta) >= thresholds[metric];
  const direction = significant ? (delta > 0 ? 'up' : 'down') : 'same';
  const displayCopy = significant
    ? `${formatDelta(metric, delta, units)} ${directionWords[metric][direction as 'up' | 'down']}`
    : 'About the same';

  return {
    metric,
    current,
    baseline,
    delta,
    direction,
    significant,
    score: Math.abs(delta) / thresholds[metric],
    displayCopy,
  };
}

export function selectHeadline(comparisons: Array<ComparisonResult | null>): ComparisonResult | null {
  return comparisons
    .filter((comparison): comparison is ComparisonResult => Boolean(comparison?.significant))
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

export function compactComparisonLabel(
  comparison: ComparisonResult | null,
  units: UnitSystem,
): string | null {
  if (!comparison?.significant || comparison.delta === null) return null;
  const arrow = comparison.direction === 'up' ? '↑' : '↓';
  return `${arrow}${formatDelta(comparison.metric, comparison.delta, units)}`;
}

export function defaultUnitsForLocale(locale: string): UnitSystem {
  try {
    const region = new Intl.Locale(locale).region;
    return region === 'US' ? 'imperial' : 'metric';
  } catch {
    return /(^|[-_])US$/i.test(locale) ? 'imperial' : 'metric';
  }
}

export function localTimeLabel(isoLocal: string): string {
  const hour = Number(isoLocal.slice(11, 13));
  if (!Number.isFinite(hour)) return '';
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

function isRainOrStorm(point: Pick<HourlyPoint, 'rainMm' | 'weatherCode'>): boolean {
  const code = point.weatherCode ?? 0;
  return (point.rainMm ?? 0) >= 0.1
    || (code >= 51 && code <= 67)
    || (code >= 80 && code <= 82)
    || code >= 95;
}

function upcomingTimingPhrase(targetTime: string | null, currentTime: string): string {
  if (!targetTime) return 'later';
  if (hourKey(targetTime) === hourKey(currentTime)) return 'very soon';
  const hour = Number(targetTime.slice(11, 13));
  if (!Number.isFinite(hour)) return 'later';
  if (hour < 5) return 'before dawn';
  if (hour < 12) return 'later this morning';
  if (hour < 17) return 'later this afternoon';
  if (hour < 22) return 'later this evening';
  return 'later tonight';
}

export function weekdayLabel(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export function conditionFor(code: number | null, isDay = true) {
  if (!isDay && code === 0) {
    return { label: 'Clear night', symbol: 'moon.stars.fill' as const, theme: 'night' as const };
  }
  if (!isDay && (code === 1 || code === 2)) {
    return { label: 'Partly cloudy', symbol: 'cloud.moon.fill' as const, theme: 'night' as const };
  }
  if (code === 0) return { label: 'Clear', symbol: 'sun.max.fill' as const, theme: 'clear' as const };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', symbol: 'cloud.sun.fill' as const, theme: 'clear' as const };
  if (code === 3) return { label: 'Overcast', symbol: 'cloud.fill' as const, theme: 'cloud' as const };
  if (code === 45 || code === 48) return { label: 'Foggy', symbol: 'cloud.fog.fill' as const, theme: 'cloud' as const };
  if (code !== null && code >= 51 && code <= 57) {
    return { label: 'Drizzle', symbol: 'cloud.drizzle.fill' as const, theme: 'rain' as const };
  }
  if (code !== null && ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))) {
    return { label: code >= 80 ? 'Rain showers' : 'Rain', symbol: 'cloud.rain.fill' as const, theme: 'rain' as const };
  }
  if (code !== null && ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))) {
    return { label: 'Snow', symbol: 'cloud.snow.fill' as const, theme: 'snow' as const };
  }
  if (code !== null && code >= 95) return { label: 'Thunderstorms', symbol: 'cloud.bolt.rain.fill' as const, theme: 'storm' as const };
  return { label: 'Mixed conditions', symbol: 'cloud.sun.fill' as const, theme: 'cloud' as const };
}

export function deriveWeather(snapshot: WeatherSnapshot, units: UnitSystem): DerivedWeather {
  const yesterdayHour = findPreviousDayPoint(snapshot.hourly, snapshot.current.time);
  const todayDate = snapshot.current.time.slice(0, 10);
  const yesterdayDate = previousLocalDayTime(`${todayDate}T12:00`).slice(0, 10);
  const today = snapshot.daily.find((day) => day.date === todayDate) ?? null;
  const yesterday = snapshot.daily.find((day) => day.date === yesterdayDate) ?? null;

  const temperature = buildComparison('temperature', snapshot.current.temperatureC, yesterdayHour?.temperatureC ?? null, units);
  const apparent = buildComparison('apparent', snapshot.current.apparentC, yesterdayHour?.apparentC ?? null, units);
  const rain = buildComparison('rain', today?.precipitationProbabilityMax ?? null, yesterday?.precipitationProbabilityMax ?? null, units);
  const humidity = buildComparison('humidity', snapshot.current.humidity, yesterdayHour?.humidity ?? null, units);
  const wind = buildComparison('wind', snapshot.current.windKmh, yesterdayHour?.windKmh ?? null, units);
  const high = buildComparison('high', today?.highC ?? null, yesterday?.highC ?? null, units);
  const low = buildComparison('low', today?.lowC ?? null, yesterday?.lowC ?? null, units);
  const headline = selectHeadline([temperature, rain, wind, humidity, apparent]);
  const currentIndex = snapshot.hourly.findIndex((point) => hourKey(point.time) === hourKey(snapshot.current.time));
  const hourlyStart = currentIndex >= 0 ? currentIndex : 0;

  return {
    yesterdayHour,
    today,
    yesterday,
    temperature,
    apparent,
    rain,
    humidity,
    wind,
    high,
    low,
    headline,
    next24: snapshot.hourly.slice(hourlyStart, hourlyStart + 24),
    next7: snapshot.daily.filter((day) => day.date >= todayDate).slice(0, 7),
  };
}

export function getRainGuidance(probability: number) {
  if (probability >= 85) return { sentence: 'Rain is almost certain.', umbrella: 'Take an umbrella', tone: 'blue' as const };
  if (probability >= 65) return { sentence: 'It’ll probably rain.', umbrella: 'Take an umbrella', tone: 'blue' as const };
  if (probability >= 45) return { sentence: 'Rain is roughly 50/50.', umbrella: 'Take an umbrella', tone: 'blue' as const };
  if (probability >= 25) return { sentence: 'It might rain, but it might not.', umbrella: 'Take an umbrella', tone: 'green' as const };
  return { sentence: 'It should stay dry.', umbrella: 'Leave it at home', tone: 'green' as const };
}

export function getLayerGuidance(warmestApparentC: number, coolestApparentC: number) {
  if (warmestApparentC >= 35) return { title: 'Dress very light', detail: 'Loose, breathable clothes. Skip extra layers.', tone: 'orange' as const };
  if (coolestApparentC <= 5) return { title: 'Wear 3 layers', detail: 'A base layer, something warm, and a coat.', tone: 'green' as const };
  if (coolestApparentC <= 12) return { title: 'Wear 2 layers', detail: 'A top plus a sweater or light jacket.', tone: 'green' as const };
  if (coolestApparentC <= 18) return { title: 'Take 1 light layer', detail: 'A light overshirt or jacket will do.', tone: 'green' as const };
  return { title: 'No extra layers', detail: 'What you’re wearing should be fine.', tone: 'green' as const };
}

export function getSunGuidance(uvIndex: number | null, isDay: boolean) {
  if (!isDay) return { title: 'No sunscreen needed now', detail: 'The sun is down for now.', tone: 'green' as const };
  if (uvIndex === null) return { title: 'Sunscreen is smart', detail: 'Put some on if you’ll be outside for a while.', tone: 'orange' as const };
  if (uvIndex >= 6) return { title: 'Put on sunscreen', detail: `UV reaches ${Math.round(uvIndex)} today. Reapply if you’re out for long.`, tone: 'orange' as const };
  if (uvIndex >= 3) return { title: 'Sunscreen is smart', detail: `UV is moderate at ${Math.round(uvIndex)} today.`, tone: 'orange' as const };
  return { title: 'You can skip it', detail: `UV stays low at ${Math.round(uvIndex)} today.`, tone: 'green' as const };
}

export function getWeatherHeadline({
  hasStorm,
  rainProbability,
  warmestApparentC,
  coolestApparentC,
  maxWindKmh,
  currentApparentC,
  currentCode,
  isDay,
}: {
  hasStorm: boolean;
  rainProbability: number;
  warmestApparentC: number;
  coolestApparentC: number;
  maxWindKmh?: number;
  currentApparentC?: number | null;
  currentCode?: number | null;
  isDay?: boolean;
}): string {
  if (hasStorm) return 'Thunderstorms are possible.';
  if (rainProbability >= 85) return 'Rain is almost certain.';
  if (warmestApparentC >= 39) return 'It’ll feel intensely hot.';
  if (coolestApparentC <= 2) return 'It’ll feel bitterly cold.';
  if (rainProbability >= 65) return 'Rain is likely.';
  if (rainProbability >= 45) return 'Rain is about 50/50.';
  if ((maxWindKmh ?? 0) >= 50) return 'Strong winds are likely.';
  if ((maxWindKmh ?? 0) >= 35) return 'A gusty spell is likely.';
  if (currentCode === 45 || currentCode === 48) return 'Visibility may be low.';
  if (currentCode !== null && currentCode !== undefined && currentCode >= 51 && currentCode <= 82) {
    return 'A little rain is passing through.';
  }
  if (isDay === false && currentApparentC !== null && currentApparentC !== undefined && currentApparentC <= 18) {
    return 'It’ll feel cool tonight.';
  }
  if (currentApparentC !== null && currentApparentC !== undefined && currentApparentC >= 35) {
    return 'It’ll feel hot.';
  }
  if (currentApparentC !== null && currentApparentC !== undefined && currentApparentC >= 30) {
    return 'It’ll feel warm.';
  }
  return 'Mostly dry for the next few hours.';
}

export function getPracticalAdvice(
  snapshot: WeatherSnapshot,
  derived: DerivedWeather,
  units: UnitSystem = 'metric',
): PracticalAdvice {
  const next12 = derived.next24.slice(0, 12);
  const rainMax = Math.max(0, ...next12.map((point) => point.precipitationProbability ?? 0));
  const firstPossibleRain = next12.find((point) => (point.precipitationProbability ?? 0) >= 25);
  const firstWetForecast = next12.find(isRainOrStorm);
  const apparentValues = next12
    .map((point) => point.apparentC)
    .filter((value): value is number => value !== null);
  const windValues = next12
    .map((point) => point.windKmh)
    .filter((value): value is number => value !== null);
  const fallback = snapshot.current.apparentC ?? 20;
  const warmest = apparentValues.length ? Math.max(...apparentValues) : fallback;
  const coolest = apparentValues.length ? Math.min(...apparentValues) : fallback;
  const maxWind = windValues.length ? Math.max(...windValues) : snapshot.current.windKmh ?? 0;
  const hasStorm = next12.some((point) => (point.weatherCode ?? 0) >= 95);
  const rain = getRainGuidance(rainMax);
  const layers = getLayerGuidance(warmest, coolest);
  const baseHeadline = getWeatherHeadline({
    hasStorm,
    rainProbability: rainMax,
    warmestApparentC: warmest,
    coolestApparentC: coolest,
    maxWindKmh: maxWind,
    currentApparentC: snapshot.current.apparentC,
    currentCode: snapshot.current.weatherCode,
    isDay: snapshot.current.isDay,
  });
  const currentIndex = snapshot.hourly.findIndex((point) => hourKey(point.time) === hourKey(snapshot.current.time));
  const recentHours = currentIndex > 0 ? snapshot.hourly.slice(Math.max(0, currentIndex - 3), currentIndex) : [];
  const rainedRecently = recentHours.some((point) => {
    const code = point.weatherCode ?? 0;
    return (point.rainMm ?? 0) >= 0.1
      || (code >= 51 && code <= 67)
      || (code >= 80 && code <= 82);
  });
  const meaningfulRain = rainMax >= 25;
  const currentlyWet = isRainOrStorm(snapshot.current);
  const currentlyStormy = (snapshot.current.weatherCode ?? 0) >= 95;
  const nonCurrentPossibleRain = firstPossibleRain
    && hourKey(firstPossibleRain.time) !== hourKey(snapshot.current.time)
    ? firstPossibleRain
    : null;
  const rainTimingPoint = firstWetForecast ?? nonCurrentPossibleRain;
  const rainTimingPhrase = upcomingTimingPhrase(rainTimingPoint?.time ?? null, snapshot.current.time);
  const firstStorm = next12.find((point) => (point.weatherCode ?? 0) >= 95);
  const stormTimingPhrase = upcomingTimingPhrase(firstStorm?.time ?? null, snapshot.current.time);
  const headline = baseHeadline === 'Thunderstorms are possible.' && !currentlyStormy
    ? `Thunderstorms are possible ${stormTimingPhrase}.`
    : !currentlyWet && baseHeadline === 'Rain is almost certain.'
      ? `Rain is almost certain ${rainTimingPhrase}.`
      : !currentlyWet && baseHeadline === 'Rain is likely.'
        ? `Rain is likely ${rainTimingPhrase}.`
        : !currentlyWet && baseHeadline === 'Rain is about 50/50.'
          ? `Rain is about 50/50 ${rainTimingPhrase}.`
          : baseHeadline;
  const rainTiming = currentlyWet ? '' : ` Most likely ${rainTimingPhrase}.`;
  const rainActionDetail = currentlyStormy
    ? 'Thunderstorms are moving through now.'
    : currentlyWet
      ? 'Expect wet conditions over the next few hours.'
      : hasStorm
        ? `Thunderstorms are possible ${stormTimingPhrase}.`
        : rainMax >= 85
          ? `Rain is almost certain ${rainTimingPhrase}.`
          : rainMax >= 65
            ? `Rain is likely ${rainTimingPhrase}.`
            : rainMax >= 45
              ? `Rain is about 50/50 ${rainTimingPhrase}.`
              : `Rain is possible ${rainTimingPhrase}.`;
  const comparisonLine = derived.temperature?.significant
    ? `It’s ${derived.temperature.displayCopy} than this time yesterday.`
    : null;

  const candidates: Array<{ priority: number; action: PracticalAdvice['actions'][number] }> = [];

  if (meaningfulRain) {
    candidates.push({
      priority: rainMax >= 85 ? 100 : rainMax >= 65 ? 84 : rainMax >= 45 ? 67 : 44,
      action: {
        kind: 'umbrella',
        title: 'Take an umbrella',
        detail: rainActionDetail,
        symbol: 'umbrella.fill',
        tone: 'blue',
      },
    });
  } else if (rainedRecently) {
    candidates.push({
      priority: 26,
      action: {
        kind: 'umbrella',
        title: 'Watch for wet ground',
        detail: 'The rain has passed for now.',
        symbol: 'umbrella.fill',
        tone: 'green',
      },
    });
  }

  if (warmest >= 35) {
    candidates.push({
      priority: warmest >= 39 ? 94 : 73,
      action: {
        kind: 'heat',
        title: warmest >= 39 ? 'Prepare for intense heat' : 'Dress light',
        detail: `It could feel like ${formatTemperature(warmest, units)}. Take water.`,
        symbol: 'thermometer.sun.fill',
        tone: 'orange',
      },
    });
  } else if (coolest <= 18) {
    const coldestPoint = next12.find((point) => point.apparentC === coolest);
    const currentApparent = snapshot.current.apparentC ?? coolest;
    const coolsMeaningfullyAfterDark = snapshot.current.isDay
      && coldestPoint?.isDay === false
      && currentApparent - coolest >= 4;
    const laterTitle = coolest <= 5
      ? 'Bring warm layers for tonight'
      : coolest <= 12
        ? 'Bring a jacket for tonight'
        : 'Bring a light layer for tonight';
    candidates.push({
      priority: coolest <= 2 ? 93 : coolest <= 5 ? 76 : coolest <= 12 ? 56 : 36,
      action: {
        kind: 'layers',
        title: coolsMeaningfullyAfterDark ? laterTitle : layers.title,
        detail: layers.detail,
        symbol: 'tshirt.fill',
        tone: 'green',
      },
    });
  }

  const todayUv = derived.today?.uvIndexMax ?? null;
  const nearbyDays = snapshot.daily.slice(0, 5);
  const frequentHighUv = nearbyDays.filter((day) => (day.uvIndexMax ?? 0) >= 6).length >= 3;
  if (snapshot.current.isDay && todayUv !== null && (todayUv >= 8 || (todayUv >= 6 && frequentHighUv))) {
    candidates.push({
      priority: todayUv >= 8 ? 64 : 43,
      action: {
        kind: 'sun',
        title: 'Put on sunscreen',
        detail: `UV reaches ${Math.round(todayUv)} today${frequentHighUv ? ' and runs high most days here' : ''}.`,
        symbol: 'sun.max.fill',
        tone: 'orange',
      },
    });
  }

  if (maxWind >= 35) {
    candidates.push({
      priority: maxWind >= 50 ? 88 : 54,
      action: {
        kind: 'wind',
        title: maxWind >= 50 ? 'It’ll be properly windy' : 'Expect a gusty spell',
        detail: `Wind could reach about ${formatWind(maxWind, units)} in the next few hours.`,
        symbol: 'wind',
        tone: 'blue',
      },
    });
  }

  const actions = candidates
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 2)
    .map(({ action }) => action);

  const rainLine = meaningfulRain
    ? `${rain.sentence}${rainTiming}`
    : rainedRecently
      ? 'The earlier rain looks like it has passed.'
      : null;
  const summary = comparisonLine;

  return {
    headline,
    comparisonLine,
    rainLine,
    summary,
    quietLine: actions.length === 0 ? 'Nothing unusual to plan around.' : null,
    actions,
  };
}

export function comparisonSentence(comparison: ComparisonResult | null, subject: string): string {
  if (!comparison || comparison.baseline === null || !comparison.significant) return '';
  return `${subject} is ${comparison.displayCopy} than yesterday`;
}
