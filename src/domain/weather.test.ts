import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComparison,
  celsiusToFahrenheit,
  compactComparisonLabel,
  comparisonSentence,
  defaultUnitsForLocale,
  deriveWeather,
  findPreviousDayPoint,
  getLayerGuidance,
  getWeatherHeadline,
  getPracticalAdvice,
  getRainGuidance,
  getSunGuidance,
  previousLocalDayTime,
  selectHeadline,
} from './weather.ts';
import type { HourlyPoint, WeatherSnapshot } from './types.ts';

function point(time: string, temperatureC: number): HourlyPoint {
  return {
    time,
    temperatureC,
    apparentC: temperatureC,
    humidity: 50,
    precipitationProbability: 10,
    rainMm: 0,
    windKmh: 10,
    weatherCode: 0,
    isDay: true,
  };
}

test('previous local time uses the calendar day across month and year boundaries', () => {
  assert.equal(previousLocalDayTime('2026-01-01T08:42'), '2025-12-31T08:42');
  assert.equal(previousLocalDayTime('2024-03-01T23:00'), '2024-02-29T23:00');
});

test('same-hour matching is calendar based rather than subtracting elapsed hours', () => {
  const points = [point('2026-03-07T03:00', 9), point('2026-03-08T02:00', 10)];
  assert.equal(findPreviousDayPoint(points, '2026-03-08T03:45')?.temperatureC, 9);
});

test('temperature and locale conversions are stable', () => {
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(20), 68);
  assert.equal(defaultUnitsForLocale('en-US'), 'imperial');
  assert.equal(defaultUnitsForLocale('en-IN'), 'metric');
});

test('comparison thresholds suppress noise immediately below their boundary', () => {
  assert.equal(buildComparison('temperature', 20.9, 20, 'metric')?.significant, false);
  assert.equal(buildComparison('temperature', 21, 20, 'metric')?.displayCopy, '1° warmer');
  assert.equal(buildComparison('rain', 29, 20, 'metric')?.significant, false);
  assert.equal(buildComparison('rain', 30, 20, 'metric')?.displayCopy, '10 points more likely');
});

test('quiet comparisons stay visual and silent instead of repeating “same as yesterday”', () => {
  const quiet = buildComparison('temperature', 20.7, 20, 'metric');
  const warmer = buildComparison('temperature', 23, 20, 'metric');
  assert.equal(compactComparisonLabel(quiet, 'metric'), null);
  assert.equal(comparisonSentence(quiet, 'Temperature'), '');
  assert.equal(compactComparisonLabel(warmer, 'metric'), '↑3°');
});

test('the headline ranks change by its significance threshold', () => {
  const temperature = buildComparison('temperature', 22, 20, 'metric');
  const rain = buildComparison('rain', 45, 10, 'metric');
  assert.equal(selectHeadline([temperature, rain])?.metric, 'rain');
});

test('missing baselines do not create a comparative headline', () => {
  const comparison = buildComparison('wind', 12, null, 'metric');
  assert.equal(comparison?.displayCopy, 'No comparison yet');
  assert.equal(selectHeadline([comparison]), null);
});

test('rain language uses practical confidence bands', () => {
  assert.equal(getRainGuidance(15).sentence, 'It should stay dry.');
  assert.equal(getRainGuidance(30).sentence, 'It might rain, but it might not.');
  assert.equal(getRainGuidance(30).umbrella, 'Take an umbrella');
  assert.equal(getRainGuidance(50).sentence, 'Rain is roughly 50/50.');
  assert.equal(getRainGuidance(70).sentence, 'It’ll probably rain.');
  assert.equal(getRainGuidance(90).sentence, 'Rain is almost certain.');
});

test('low-confidence rain uses a direct umbrella prompt with calibrated detail', () => {
  const hourly = [
    point('2026-08-27T14:00', 24),
    { ...point('2026-08-28T14:00', 25), precipitationProbability: 10 },
    { ...point('2026-08-28T15:00', 25), precipitationProbability: 30 },
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'America/Chicago',
    timezoneAbbreviation: 'CDT',
    current: hourly[1],
    hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 2, highC: 27, lowC: 18, precipitationProbabilityMax: 10, uvIndexMax: 3, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 2, highC: 28, lowC: 19, precipitationProbabilityMax: 30, uvIndexMax: 3, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T19:00:00Z',
  };

  const umbrella = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric')).actions
    .find((action) => action.kind === 'umbrella');
  assert.equal(umbrella?.title, 'Take an umbrella');
  assert.equal(umbrella?.detail, 'Rain is possible later this afternoon.');
});

test('clothing and sun advice produce direct actions', () => {
  assert.equal(getLayerGuidance(20, 17).title, 'Take 1 light layer');
  assert.equal(getLayerGuidance(15, 10).title, 'Wear 2 layers');
  assert.equal(getLayerGuidance(5, 2).title, 'Wear 3 layers');
  assert.equal(getLayerGuidance(37, 24).title, 'Dress very light');
  assert.equal(getSunGuidance(8, true).title, 'Put on sunscreen');
  assert.equal(getSunGuidance(2, true).title, 'You can skip it');
  assert.equal(getSunGuidance(8, false).title, 'No sunscreen needed now');
});

test('weather headlines describe conditions without deciding whether to go out', () => {
  assert.equal(getWeatherHeadline({ hasStorm: true, rainProbability: 40, warmestApparentC: 24, coolestApparentC: 18 }), 'Thunderstorms are possible.');
  assert.equal(getWeatherHeadline({ hasStorm: false, rainProbability: 10, warmestApparentC: 41, coolestApparentC: 30 }), 'It’ll feel intensely hot.');
  assert.equal(getWeatherHeadline({ hasStorm: false, rainProbability: 10, warmestApparentC: 5, coolestApparentC: 0 }), 'It’ll feel bitterly cold.');
  assert.equal(getWeatherHeadline({ hasStorm: false, rainProbability: 70, warmestApparentC: 25, coolestApparentC: 20 }), 'Rain is likely.');
  assert.equal(getWeatherHeadline({ hasStorm: false, rainProbability: 10, warmestApparentC: 25, coolestApparentC: 20, currentApparentC: 22, currentCode: 0, isDay: true }), 'Mostly dry for the next few hours.');
});

test('practical advice combines yesterday comparison with rain timing', () => {
  const hourly = [
    { ...point('2026-08-27T09:00', 20), precipitationProbability: 5 },
    { ...point('2026-08-28T09:00', 23), precipitationProbability: 20 },
    { ...point('2026-08-28T10:00', 24), precipitationProbability: 50 },
    { ...point('2026-08-28T11:00', 25), precipitationProbability: 70 },
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Asia/Kolkata',
    timezoneAbbreviation: 'IST',
    current: hourly[1],
    hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 0, highC: 28, lowC: 19, precipitationProbabilityMax: 10, uvIndexMax: 6, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 61, highC: 30, lowC: 21, precipitationProbabilityMax: 70, uvIndexMax: 7, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T03:30:00Z',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.equal(advice.comparisonLine, 'It’s 3° warmer than this time yesterday.');
  assert.equal(advice.headline, 'Rain is likely later this morning.');
  assert.equal(advice.actions[0].title, 'Take an umbrella');
  assert.equal(advice.actions[0].detail, 'Rain is likely later this morning.');
  assert.match(advice.rainLine ?? '', /Most likely later this morning/);
});

test('clear conditions and future rain are presented as a sequence, not a contradiction', () => {
  const hourly = [
    point('2026-08-30T04:00', 18),
    { ...point('2026-08-31T04:00', 16), isDay: false, precipitationProbability: 70 },
    { ...point('2026-08-31T05:00', 16), isDay: false, precipitationProbability: 75 },
    { ...point('2026-08-31T07:00', 17), weatherCode: 61, precipitationProbability: 80, rainMm: 0.8 },
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Europe/London',
    timezoneAbbreviation: 'BST',
    current: hourly[1],
    hourly,
    daily: [
      { date: '2026-08-30', weatherCode: 0, highC: 22, lowC: 15, precipitationProbabilityMax: 10, uvIndexMax: 2, sunrise: null, sunset: null },
      { date: '2026-08-31', weatherCode: 61, highC: 22, lowC: 15, precipitationProbabilityMax: 80, uvIndexMax: 2, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-31T03:00:00Z',
  };

  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.equal(advice.headline, 'Rain is likely later this morning.');
  assert.equal(advice.actions[0]?.detail, 'Rain is likely later this morning.');

  const wetNow = {
    ...snapshot,
    current: { ...hourly[1], weatherCode: 61, rainMm: 0.4 },
  };
  assert.equal(getPracticalAdvice(wetNow, deriveWeather(wetNow, 'metric')).headline, 'Rain is likely.');
});

test('a warm dry low-UV day does not manufacture umbrella, layer, or sunscreen advice', () => {
  const hourly = [
    point('2026-08-27T09:00', 25),
    point('2026-08-28T09:00', 25.4),
    point('2026-08-28T10:00', 28),
    point('2026-08-28T11:00', 29),
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Asia/Kolkata',
    timezoneAbbreviation: 'IST',
    current: hourly[1],
    hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 0, highC: 30, lowC: 23, precipitationProbabilityMax: 5, uvIndexMax: 2, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 0, highC: 31, lowC: 24, precipitationProbabilityMax: 10, uvIndexMax: 3, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T03:30:00Z',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.deepEqual(advice.actions, []);
  assert.equal(advice.rainLine, null);
  assert.equal(advice.quietLine, 'Nothing unusual to plan around.');
  assert.equal(advice.comparisonLine, null);
  assert.equal(advice.summary, null);
});

test('layers only appear when the upcoming apparent temperature is actually cool', () => {
  const hourly = [
    point('2026-08-27T09:00', 14),
    point('2026-08-28T09:00', 13),
    point('2026-08-28T10:00', 12),
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Europe/London', timezoneAbbreviation: 'BST', current: hourly[1], hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 3, highC: 16, lowC: 9, precipitationProbabilityMax: 10, uvIndexMax: 2, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 3, highC: 15, lowC: 8, precipitationProbabilityMax: 10, uvIndexMax: 2, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T08:00:00Z',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.deepEqual(advice.actions.map((action) => action.kind), ['layers']);
  assert.doesNotMatch(advice.actions[0]?.detail ?? '', /around \d/);
});

test('layer timing uses a useful daypart only when it cools meaningfully after dark', () => {
  const hourly = [
    point('2026-08-27T18:00', 21),
    point('2026-08-28T18:00', 22),
    point('2026-08-28T19:00', 20),
    { ...point('2026-08-28T20:00', 16), isDay: false },
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'America/Los_Angeles', timezoneAbbreviation: 'PDT', current: hourly[1], hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 1, highC: 23, lowC: 15, precipitationProbabilityMax: 5, uvIndexMax: 2, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 1, highC: 24, lowC: 14, precipitationProbabilityMax: 5, uvIndexMax: 2, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T18:00:00-07:00',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  const layerAction = advice.actions.find((action) => action.kind === 'layers');
  assert.equal(layerAction?.title, 'Bring a light layer for tonight');
  assert.equal(layerAction?.detail, 'A light overshirt or jacket will do.');
});

test('sunscreen appears for genuinely high or routinely high UV, not every daylight forecast', () => {
  const hourly = [point('2026-08-27T12:00', 27), point('2026-08-28T12:00', 28)];
  const snapshot: WeatherSnapshot = {
    timezone: 'Australia/Sydney', timezoneAbbreviation: 'AEST', current: hourly[1], hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 0, highC: 30, lowC: 22, precipitationProbabilityMax: 5, uvIndexMax: 8, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 0, highC: 31, lowC: 23, precipitationProbabilityMax: 5, uvIndexMax: 9, sunrise: null, sunset: null },
      { date: '2026-08-29', weatherCode: 0, highC: 31, lowC: 23, precipitationProbabilityMax: 5, uvIndexMax: 8, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T02:00:00Z',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.ok(advice.actions.some((action) => action.kind === 'sun'));
});

test('heat advice does not repeat the clothing instruction in its detail', () => {
  const hourly = [
    point('2026-08-27T14:00', 34),
    { ...point('2026-08-28T14:00', 35), apparentC: 36 },
    { ...point('2026-08-28T15:00', 35), apparentC: 37 },
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Asia/Kolkata', timezoneAbbreviation: 'IST', current: hourly[1], hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 1, highC: 35, lowC: 28, precipitationProbabilityMax: 5, uvIndexMax: 4, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 1, highC: 36, lowC: 29, precipitationProbabilityMax: 5, uvIndexMax: 4, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T08:30:00Z',
  };
  const heatAction = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric')).actions[0];
  assert.equal(heatAction?.title, 'Dress light');
  assert.equal(heatAction?.detail, 'It could feel like 37°. Take water.');
});

test('recent measured rain is mentioned even when the next few hours look dry', () => {
  const wet = { ...point('2026-08-28T07:00', 21), rainMm: 1.4, weatherCode: 61 };
  const hourly = [
    point('2026-08-27T09:00', 20),
    wet,
    point('2026-08-28T08:00', 21),
    point('2026-08-28T09:00', 22),
    point('2026-08-28T10:00', 23),
  ];
  const snapshot: WeatherSnapshot = {
    timezone: 'Europe/Paris', timezoneAbbreviation: 'CEST', current: hourly[3], hourly,
    daily: [
      { date: '2026-08-27', weatherCode: 61, highC: 23, lowC: 17, precipitationProbabilityMax: 70, uvIndexMax: 3, sunrise: null, sunset: null },
      { date: '2026-08-28', weatherCode: 2, highC: 24, lowC: 18, precipitationProbabilityMax: 10, uvIndexMax: 3, sunrise: null, sunset: null },
    ],
    fetchedAt: '2026-08-28T07:00:00Z',
  };
  const advice = getPracticalAdvice(snapshot, deriveWeather(snapshot, 'metric'));
  assert.equal(advice.actions[0]?.kind, 'umbrella');
  assert.equal(advice.actions[0]?.title, 'Watch for wet ground');
  assert.equal(advice.actions[0]?.detail, 'The rain has passed for now.');
});
