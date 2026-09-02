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

const FUTURE_RAIN_PREFIX = 'Wet weather is most likely ';

export function getWidgetPresentation({
  condition,
  weatherCode,
  primaryTitle,
  primaryDetail,
  primaryKind,
}: WidgetPresentationInput): WidgetPresentation {
  const isRainAdvice = primaryKind === 'umbrella' || primaryKind === 'rain';
  const hasFutureTiming = isRainAdvice && primaryDetail.startsWith(FUTURE_RAIN_PREFIX);

  if (!hasFutureTiming) return { condition, primaryTitle };

  const timing = primaryDetail
    .slice(FUTURE_RAIN_PREFIX.length)
    .replace(/\.$/, '')
    .replace(/^later (?=this |tonight$)/, '');

  const timedTitle = primaryTitle === 'Take an umbrella'
    ? `Rain ${timing}`
    : `Rain possible ${timing}`;

  const currentCondition = weatherCode === 0
    ? 'Clear for now'
    : weatherCode !== null && weatherCode <= 2
      ? 'Dry for now'
      : condition;

  return { condition: currentCondition, primaryTitle: timedTitle };
}
