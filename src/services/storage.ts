import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationSelection, UnitSystem } from '../domain/types';

const LOCATION_KEY = 'weather-compared.location';
const UNITS_KEY = 'weather-compared.units';

export async function readPreferences(): Promise<{
  location: LocationSelection | null;
  units: UnitSystem | null;
}> {
  const [rawLocation, rawUnits] = await Promise.all([
    AsyncStorage.getItem(LOCATION_KEY),
    AsyncStorage.getItem(UNITS_KEY),
  ]);

  let location: LocationSelection | null = null;
  if (rawLocation) {
    try {
      const parsed = JSON.parse(rawLocation) as LocationSelection;
      if (parsed.displayName && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
        location = parsed;
      }
    } catch {
      await AsyncStorage.removeItem(LOCATION_KEY);
    }
  }

  return {
    location,
    units: rawUnits === 'metric' || rawUnits === 'imperial' ? rawUnits : null,
  };
}

export async function saveLocation(location: LocationSelection): Promise<void> {
  await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(location));
}

export async function saveUnits(units: UnitSystem): Promise<void> {
  await AsyncStorage.setItem(UNITS_KEY, units);
}
