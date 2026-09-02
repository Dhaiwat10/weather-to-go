import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import type { LocationSelection, UnitSystem, WeatherSnapshot } from '../domain/types';
import { conditionFor, deriveWeather, formatTemperature } from '../domain/weather';
import { getWidgetPresentation } from '../domain/widget';

const APP_GROUP = 'group.com.dhaiwat.weathercompared';
const WIDGET_KIND = 'WeatherComparedWidget';

interface WidgetSyncInput {
  location: LocationSelection;
  snapshot: WeatherSnapshot;
  units: UnitSystem;
  headline: string;
  comparison: string;
  primaryTitle: string;
  primaryDetail: string;
  primaryKind: string | null;
}

export function syncWeatherWidget({
  location,
  snapshot,
  units,
  headline,
  comparison,
  primaryTitle,
  primaryDetail,
  primaryKind,
}: WidgetSyncInput): void {
  if (Platform.OS !== 'ios') return;

  try {
    const storage = new ExtensionStorage(APP_GROUP);
    const derived = deriveWeather(snapshot, units);
    const condition = conditionFor(snapshot.current.weatherCode, snapshot.current.isDay);
    const locationName = location.name;
    const presentation = getWidgetPresentation({
      condition: condition.label,
      weatherCode: snapshot.current.weatherCode,
      primaryTitle,
      primaryDetail,
      primaryKind,
    });

    storage.set('weatherConfig', {
      latitude: location.latitude,
      longitude: location.longitude,
      locationName,
      units,
    });
    storage.set('weatherSnapshot', {
      locationName,
      temperature: formatTemperature(snapshot.current.temperatureC, units),
      condition: presentation.condition,
      high: formatTemperature(derived.today?.highC ?? null, units),
      low: formatTemperature(derived.today?.lowC ?? null, units),
      headline,
      comparison,
      primaryTitle: presentation.primaryTitle,
      primaryDetail,
      primaryKind: primaryKind ?? '',
      weatherCode: snapshot.current.weatherCode ?? -1,
      isDay: snapshot.current.isDay ? 1 : 0,
      updatedAt: snapshot.fetchedAt,
    });
    ExtensionStorage.reloadWidget(WIDGET_KIND);
  } catch {
    // Expo Go does not contain the extension module. The native development
    // build does, so keeping this silent preserves the existing Expo Go flow.
  }
}
