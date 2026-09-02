import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdviceAction, ComparisonResult, LocationSelection, UnitSystem, WeatherSnapshot } from '../domain/types';
import {
  buildComparison,
  compactComparisonLabel,
  comparisonSentence,
  conditionFor,
  deriveWeather,
  findPreviousDayPoint,
  formatTemperature,
  formatWind,
  getPracticalAdvice,
  localTimeLabel,
  weekdayLabel,
} from '../domain/weather';
import { Text } from './AppText';
import { AppSymbol, type AppSymbolName } from './AppSymbol';
import { GlassSurface } from './GlassSurface';
import { WeatherBackdrop } from './WeatherBackdrop';
import { syncWeatherWidget } from '../services/widget';

interface WeatherHomeProps {
  location: LocationSelection;
  snapshot: WeatherSnapshot;
  units: UnitSystem;
  refreshing: boolean;
  staleMessage: string | null;
  onOpenLocation: () => void;
  onRefresh: () => void;
  onToggleUnits: () => void;
}

function uniquePlaceParts(parts: Array<string | undefined>): string[] {
  return parts.filter((part, index, all): part is string => (
    Boolean(part) && all.findIndex((candidate) => candidate === part) === index
  ));
}

function GlassModule({ children, interactive = false, style }: { children: React.ReactNode; interactive?: boolean; style?: object }) {
  return (
    <GlassSurface interactive={interactive} style={[styles.glass, style]}>
      {children}
    </GlassSurface>
  );
}

function AdviceRow({ action, last }: { action: AdviceAction; last: boolean }) {
  return (
    <View style={[styles.adviceRow, !last && styles.rowDivider]}>
      <View style={styles.adviceSymbolWrap}>
        <AppSymbol fallback="•" name={action.symbol} size={22} weight="medium" />
      </View>
      <View style={styles.adviceCopy}>
        <Text style={styles.adviceTitle}>{action.title}</Text>
        <Text style={styles.adviceDetail}>{action.detail}</Text>
      </View>
    </View>
  );
}

function ModuleTitle({ symbol, children }: { symbol: AppSymbolName; children: React.ReactNode }) {
  return (
    <View style={styles.moduleTitleRow}>
      <AppSymbol
        fallback="•"
        name={symbol}
        size={12}
        style={styles.moduleTitleSymbol}
        tintColor="rgba(255,255,255,0.62)"
        weight="semibold"
      />
      <Text style={styles.moduleTitle}>{children}</Text>
    </View>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {note ? <Text style={styles.metricNote}>{note}</Text> : null}
    </View>
  );
}

function ComparisonSignal({ comparison }: { comparison: ComparisonResult | null }) {
  if (!comparison?.significant) return null;

  return (
    <View
      accessible
      accessibilityLabel={`It is ${comparison.displayCopy} than this time yesterday`}
      style={styles.comparisonSignal}
    >
      <Text style={styles.comparisonSignalValue}>
        {comparison.displayCopy} than yesterday at this time
      </Text>
    </View>
  );
}

export function WeatherHome({
  location,
  snapshot,
  units,
  refreshing,
  staleMessage,
  onOpenLocation,
  onRefresh,
  onToggleUnits,
}: WeatherHomeProps) {
  const [forecastOpen, setForecastOpen] = useState(true);
  const forecastProgress = useRef(new Animated.Value(1)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const derived = useMemo(() => deriveWeather(snapshot, units), [snapshot, units]);
  const advice = useMemo(() => getPracticalAdvice(snapshot, derived, units), [snapshot, derived, units]);
  const condition = conditionFor(snapshot.current.weatherCode, snapshot.current.isDay);
  const today = derived.today;
  const isCurrentLocation = location.source === 'geolocation';
  const locationName = isCurrentLocation ? 'My Location' : location.name;
  const locationSubtitle = isCurrentLocation
    ? uniquePlaceParts([location.name, location.admin1]).join(', ')
    : '';
  const weekTemperatureDomain = useMemo(() => {
    const values = derived.next7.flatMap((day) => [day.lowC, day.highC])
      .filter((value): value is number => value !== null);
    const minimum = values.length > 0 ? Math.min(...values) : 0;
    const maximum = values.length > 0 ? Math.max(...values) : minimum + 1;
    return { minimum, span: Math.max(1, maximum - minimum) };
  }, [derived.next7]);

  useEffect(() => {
    syncWeatherWidget({
      location,
      snapshot,
      units,
      headline: advice.headline,
      comparison: advice.comparisonLine ?? '',
      primaryTitle: advice.actions[0]?.title ?? condition.label,
      primaryDetail: advice.actions[0]?.detail ?? '',
      primaryKind: advice.actions[0]?.kind ?? null,
    });
  }, [advice, location, snapshot, units]);

  const toggleForecast = () => {
    const nextOpen = !forecastOpen;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setForecastOpen(nextOpen);
    Animated.timing(forecastProgress, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: nextOpen ? 1 : 0,
      useNativeDriver: true,
    }).start();
    void Haptics.selectionAsync();
  };

  const forecastChevronRotation = forecastProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.flex}>
      <WeatherBackdrop isDay={snapshot.current.isDay} scrollY={scrollY} theme={condition.theme} />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.topBar}>
          <View style={styles.topSide} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change location. Current location is ${location.displayName}`}
            hitSlop={10}
            onPress={onOpenLocation}
            style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.locationName}>{locationName}</Text>
            {locationSubtitle ? (
              <Text numberOfLines={1} style={styles.locationSubtitle}>{locationSubtitle}</Text>
            ) : null}
            <AppSymbol name="chevron.down" size={11} style={styles.locationChevron} tintColor="rgba(255,255,255,0.78)" weight="semibold" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Use ${units === 'metric' ? 'Fahrenheit' : 'Celsius'}`}
            hitSlop={8}
            onPress={onToggleUnits}
            style={({ pressed }) => [styles.unitButton, pressed && styles.pressed]}
          >
            <GlassSurface
              pointerEvents="none"
              style={styles.unitGlass}
              tintColor="rgba(5, 18, 30, 0.24)"
            />
            <Text style={styles.unitText}>°{units === 'metric' ? 'C' : 'F'}</Text>
          </Pressable>
        </View>

        <Animated.ScrollView
          alwaysBounceVertical
          contentContainerStyle={styles.content}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, compact && styles.heroCompact]}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.temperature}>
              {formatTemperature(snapshot.current.temperatureC, units)}
            </Text>
            <Text style={styles.condition}>{condition.label}</Text>
            <Text style={styles.highLow}>
              H:{formatTemperature(today?.highC ?? null, units)}  L:{formatTemperature(today?.lowC ?? null, units)}
            </Text>
          </View>

          <ComparisonSignal comparison={derived.temperature} />

          {staleMessage ? (
            <View style={styles.stalePill}>
              <Text style={styles.staleText}>{staleMessage}</Text>
            </View>
          ) : null}

          {advice.actions.length > 0 ? (
            <GlassModule style={styles.briefingModule}>
              {advice.actions.map((action, index) => (
                <AdviceRow action={action} key={action.kind} last={index === advice.actions.length - 1} />
              ))}
            </GlassModule>
          ) : (
            <View style={styles.quietBrief}>
              <Text style={styles.quietBriefText}>{advice.headline}</Text>
            </View>
          )}

          {forecastOpen ? (
            <View style={styles.forecastStack}>
              <GlassModule>
                <ModuleTitle symbol="clock.fill">Hourly</ModuleTitle>
                <ScrollView
                  horizontal
                  contentContainerStyle={styles.hourlyContent}
                  showsHorizontalScrollIndicator={false}
                >
                  {derived.next24.map((point, index) => {
                    const pointCondition = conditionFor(point.weatherCode, point.isDay);
                    const previous = findPreviousDayPoint(snapshot.hourly, point.time);
                    const comparison = buildComparison('temperature', point.temperatureC, previous?.temperatureC ?? null, units);
                    const deltaLabel = compactComparisonLabel(comparison, units);
                    return (
                      <View style={styles.hour} key={point.time}>
                        <Text style={styles.hourTime}>{index === 0 ? 'Now' : localTimeLabel(point.time)}</Text>
                        <AppSymbol
                          fallback="•"
                          name={pointCondition.symbol}
                          size={26}
                          style={styles.hourSymbol}
                          type="multicolor"
                        />
                        <Text style={styles.hourTemp}>{formatTemperature(point.temperatureC, units)}</Text>
                        <Text style={styles.hourRain}>{(point.precipitationProbability ?? 0) >= 10 ? `${Math.round(point.precipitationProbability ?? 0)}%` : ' '}</Text>
                        <Text style={styles.hourDelta}>{deltaLabel ?? ' '}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </GlassModule>

              <GlassModule>
                <ModuleTitle symbol="calendar">7-day</ModuleTitle>
                <View style={styles.dailyList}>
                  {derived.next7.map((day, index) => {
                    const dayCondition = conditionFor(day.weatherCode, true);
                    const dayLow = day.lowC ?? weekTemperatureDomain.minimum;
                    const dayHigh = day.highC ?? dayLow;
                    const rawStart = Math.max(0, (dayLow - weekTemperatureDomain.minimum) / weekTemperatureDomain.span);
                    const barWidth = Math.max(0.1, (dayHigh - dayLow) / weekTemperatureDomain.span);
                    const barStart = Math.min(rawStart, 1 - barWidth);
                    const barEnd = Math.max(0, 1 - barStart - barWidth);
                    return (
                      <View style={[styles.dayRow, index > 0 && styles.dayDivider]} key={day.date}>
                        <Text style={styles.dayName}>{index === 0 ? 'Today' : weekdayLabel(day.date)}</Text>
                        <View style={styles.dayCondition}>
                          <AppSymbol
                            fallback="•"
                            name={dayCondition.symbol}
                            size={23}
                            style={styles.daySymbol}
                            type="multicolor"
                          />
                          {(day.precipitationProbabilityMax ?? 0) >= 20 ? (
                            <Text style={styles.dayRain}>{Math.round(day.precipitationProbabilityMax ?? 0)}%</Text>
                          ) : null}
                        </View>
                        <Text style={styles.dayLow}>{formatTemperature(day.lowC, units)}</Text>
                        <View style={styles.tempTrack}>
                          <View style={{ flex: barStart }} />
                          <View style={[styles.tempTrackFill, { flex: barWidth }]} />
                          <View style={{ flex: barEnd }} />
                        </View>
                        <Text style={styles.dayHigh}>{formatTemperature(day.highC, units)}</Text>
                      </View>
                    );
                  })}
                </View>
              </GlassModule>

              <GlassModule>
                <ModuleTitle symbol="chart.bar.fill">Details</ModuleTitle>
                <View style={styles.metricsGrid}>
                  <Metric
                    label="Feels like"
                    value={formatTemperature(snapshot.current.apparentC, units)}
                    note={comparisonSentence(derived.apparent, 'Feels-like').replace('Feels-like is ', '')}
                  />
                  <Metric
                    label="Humidity"
                    value={snapshot.current.humidity === null ? '—' : `${Math.round(snapshot.current.humidity)}%`}
                    note={comparisonSentence(derived.humidity, 'Humidity').replace('Humidity is ', '')}
                  />
                  <Metric
                    label="Wind"
                    value={formatWind(snapshot.current.windKmh, units)}
                    note={comparisonSentence(derived.wind, 'Wind').replace('Wind is ', '')}
                  />
                  <Metric
                    label="Chance of rain"
                    value={today?.precipitationProbabilityMax === null || today?.precipitationProbabilityMax === undefined ? '—' : `${Math.round(today.precipitationProbabilityMax)}%`}
                    note={comparisonSentence(derived.rain, 'Rain').replace('Rain is ', '')}
                  />
                </View>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL('https://open-meteo.com/')}
                  style={({ pressed }) => [styles.attributionLink, pressed && styles.pressed]}
                >
                  <Text style={styles.attributionText}>Open-Meteo ↗</Text>
                </Pressable>
              </GlassModule>
            </View>
          ) : null}

          <Pressable
            accessibilityLabel={forecastOpen ? 'Hide forecast' : 'Show forecast'}
            accessibilityRole="button"
            accessibilityState={{ expanded: forecastOpen }}
            hitSlop={8}
            onPress={toggleForecast}
            style={({ pressed }) => [styles.forecastToggle, pressed && styles.forecastTogglePressed]}
          >
            <Text style={styles.forecastToggleText}>{forecastOpen ? 'Hide forecast' : 'Show forecast'}</Text>
            <Animated.View style={[styles.forecastChevron, { transform: [{ rotate: forecastChevronRotation }] }]}>
              <AppSymbol
                name="chevron.down"
                size={11}
                tintColor="rgba(255,255,255,0.48)"
                weight="semibold"
              />
            </Animated.View>
          </Pressable>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 32, paddingHorizontal: 16 },
  topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 60, paddingHorizontal: 16 },
  topSide: { width: 46 },
  locationButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 56, paddingHorizontal: 8 },
  locationName: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.2, lineHeight: 20, maxWidth: 245, textShadowColor: 'rgba(0,10,22,0.22)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  locationSubtitle: { color: 'rgba(255,255,255,0.64)', fontSize: 11, fontWeight: '500', lineHeight: 14, maxWidth: 245 },
  locationChevron: { marginTop: 3 },
  unitButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  unitGlass: { ...StyleSheet.absoluteFillObject, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  unitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.66, transform: [{ scale: 0.985 }] },
  hero: { alignItems: 'center', paddingBottom: 18, paddingTop: 12 },
  heroCompact: { paddingBottom: 14, paddingTop: 3 },
  temperature: { color: '#FFFFFF', fontSize: 98, fontWeight: '200', letterSpacing: -4.6, lineHeight: 105, marginLeft: -4, textShadowColor: 'rgba(0,10,22,0.18)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  condition: { color: '#FFFFFF', fontSize: 19, fontWeight: '500', letterSpacing: -0.2, marginTop: -2 },
  highLow: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '500', marginTop: 4 },
  comparisonSignal: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.085)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 19,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  comparisonSignalValue: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600', letterSpacing: -0.05 },
  quietBrief: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 24, paddingVertical: 5 },
  quietBriefText: { color: '#FFFFFF', fontSize: 23, fontWeight: '600', letterSpacing: -0.45, lineHeight: 29, textAlign: 'center' },
  stalePill: { alignSelf: 'center', backgroundColor: 'rgba(5,18,30,0.34)', borderRadius: 14, marginBottom: 12, paddingHorizontal: 13, paddingVertical: 8 },
  staleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  glass: {
    backgroundColor: 'rgba(5,18,30,0.34)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#02070D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
  },
  briefingModule: { marginBottom: 12, paddingHorizontal: 17 },
  moduleTitleRow: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 47, paddingHorizontal: 17 },
  moduleTitleSymbol: { marginRight: 8 },
  moduleTitle: { color: 'rgba(255,255,255,0.62)', fontSize: 13, fontWeight: '600', letterSpacing: -0.05 },
  adviceRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 18 },
  rowDivider: { borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth },
  adviceSymbolWrap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.085)', borderRadius: 21, height: 42, justifyContent: 'center', marginRight: 14, width: 42 },
  adviceCopy: { flex: 1 },
  adviceTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.2, lineHeight: 21 },
  adviceDetail: { color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 19, marginTop: 3 },
  forecastToggle: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', marginTop: 9, minHeight: 38, paddingHorizontal: 14 },
  forecastTogglePressed: { opacity: 0.46 },
  forecastToggleText: { color: 'rgba(255,255,255,0.48)', fontSize: 12, fontWeight: '600' },
  forecastChevron: { alignItems: 'center', height: 18, justifyContent: 'center', marginLeft: 5, width: 18 },
  forecastStack: { gap: 12 },
  hourlyContent: { paddingBottom: 18, paddingHorizontal: 9, paddingTop: 18 },
  hour: { alignItems: 'center', width: 66 },
  hourTime: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  hourSymbol: { height: 32, marginTop: 10, width: 30 },
  hourTemp: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginTop: 3 },
  hourRain: { color: '#7ED4FF', fontSize: 11, fontWeight: '700', height: 16, marginTop: 2 },
  hourDelta: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  dailyList: { paddingHorizontal: 15 },
  dayRow: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  dayDivider: { borderTopColor: 'rgba(255,255,255,0.1)', borderTopWidth: StyleSheet.hairlineWidth },
  dayName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', width: 64 },
  dayCondition: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', width: 62 },
  daySymbol: { height: 26, width: 28 },
  dayRain: { color: '#7ED4FF', fontSize: 9, fontWeight: '700', marginLeft: 3 },
  dayLow: { color: 'rgba(255,255,255,0.62)', fontSize: 15, textAlign: 'right', width: 34 },
  tempTrack: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 2, flex: 1, flexDirection: 'row', height: 4, marginHorizontal: 10, overflow: 'hidden' },
  tempTrackFill: { backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 2, height: 4 },
  dayHigh: { color: '#FFFFFF', fontSize: 15, textAlign: 'right', width: 34 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 10, paddingHorizontal: 7 },
  metric: { minHeight: 116, paddingHorizontal: 9, paddingTop: 14, width: '50%' },
  metricLabel: { color: 'rgba(255,255,255,0.56)', fontSize: 12, fontWeight: '600', letterSpacing: -0.05 },
  metricValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '400', letterSpacing: -0.55, marginTop: 5 },
  metricNote: { color: 'rgba(255,255,255,0.68)', fontSize: 11, lineHeight: 15, marginTop: 4 },
  attributionLink: { alignSelf: 'flex-start', marginBottom: 13, marginHorizontal: 16, paddingVertical: 2 },
  attributionText: { color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: '500' },
});
