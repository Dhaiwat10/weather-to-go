interface WidgetPresentationInput {
  condition: string;
  weatherCode: number | null;
  primaryTitle: string;
  primaryDetail: string;
  primaryKind: string | null;
}

interface WidgetPresentation {
  condition: string;
  primaryTitle: string;
}

const FUTURE_RAIN_PRESENTATIONS = [
  { prefix: 'Rain is almost certain ', title: 'Rain' },
  { prefix: 'Rain is likely ', title: 'Rain' },
  { prefix: 'Rain is about 50/50 ', title: 'Rain 50/50' },
  { prefix: 'Rain is possible ', title: 'Rain possible' },
  { prefix: 'Thunderstorms are possible ', title: 'Storms possible' },
] as const;

export function getWidgetPresentation({
  condition,
  weatherCode,
  primaryTitle,
  primaryDetail,
  primaryKind,
}: WidgetPresentationInput): WidgetPresentation {
  const isRainAdvice = primaryKind === 'umbrella' || primaryKind === 'rain';
  const presentation = isRainAdvice
    ? FUTURE_RAIN_PRESENTATIONS.find(({ prefix }) => primaryDetail.startsWith(prefix))
    : undefined;

  if (!presentation) return { condition, primaryTitle };

  const timing = primaryDetail
    .slice(presentation.prefix.length)
    .replace(/\.$/, '')
    .replace(/^later (?=this |tonight$)/, '');

  const timedTitle = `${presentation.title} ${timing}`;

  const currentCondition = weatherCode === 0
    ? 'Clear for now'
    : weatherCode !== null && weatherCode <= 2
      ? 'Dry for now'
      : condition;

  return { condition: currentCondition, primaryTitle: timedTitle };
}
