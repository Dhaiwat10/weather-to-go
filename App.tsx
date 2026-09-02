import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { LocationPicker } from './src/components/LocationPicker';
import { AppSymbol } from './src/components/AppSymbol';
import { fonts, Text } from './src/components/AppText';
import { WeatherHome } from './src/components/WeatherHome';
import { defaultUnitsForLocale } from './src/domain/weather';
import type { LocationSelection, UnitSystem, WeatherSnapshot } from './src/domain/types';
import { fetchWeather } from './src/services/api';
import { readPreferences, saveLocation, saveUnits } from './src/services/storage';

function currentLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
}

const SURAT_LOCATION: LocationSelection = {
  name: 'Surat',
  displayName: 'Surat, Gujarat, India',
  latitude: 21.1702,
  longitude: 72.8311,
  country: 'India',
  countryCode: 'IN',
  admin1: 'Gujarat',
  timezone: 'Asia/Kolkata',
  source: 'search',
};

function uniquePlaceParts(parts: Array<string | null | undefined>): string[] {
  return parts.filter((part, index, all): part is string => (
    Boolean(part) && all.findIndex((candidate) => candidate === part) === index
  ));
}

async function namedCurrentLocation(latitude: number, longitude: number): Promise<LocationSelection> {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    const name = address?.city
      ?? address?.district
      ?? address?.subregion
      ?? address?.region
      ?? 'Current area';
    const displayParts = uniquePlaceParts([name, address?.region, address?.country]);

    return {
      name,
      displayName: displayParts.join(', ') || 'Current area',
      latitude,
      longitude,
      country: address?.country ?? undefined,
      countryCode: address?.isoCountryCode ?? undefined,
      admin1: address?.region ?? address?.subregion ?? undefined,
      timezone: address?.timezone ?? undefined,
      source: 'geolocation',
    };
  } catch {
    return {
      name: 'Current area',
      displayName: 'Current area',
      latitude,
      longitude,
      source: 'geolocation',
    };
  }
}

async function initialLocation(): Promise<LocationSelection> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) return SURAT_LOCATION;

    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return namedCurrentLocation(result.coords.latitude, result.coords.longitude);
  } catch {
    return SURAT_LOCATION;
  }
}

function LoadingScreen() {
  return (
    <LinearGradient colors={['#294D67', '#17354B', '#081A29']} style={styles.flex}>
      <SafeAreaView style={styles.center}>
        <View style={styles.loadingMark}>
          <AppSymbol name="cloud.sun.fill" size={29} type="multicolor" />
        </View>
        <ActivityIndicator color="#FFFFFF" size="small" style={styles.spinner} />
        <Text style={styles.loadingText}>Checking outside…</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

function FailureScreen({
  message,
  onRetry,
  onChangeLocation,
}: {
  message: string;
  onRetry: () => void;
  onChangeLocation: () => void;
}) {
  return (
    <LinearGradient colors={['#344957', '#1E3340', '#0B1B25']} style={styles.flex}>
      <SafeAreaView style={styles.failure}>
        <View style={styles.failureIcon}><AppSymbol name="arrow.clockwise" size={26} weight="medium" /></View>
        <Text style={styles.failureTitle}>Couldn’t check the weather.</Text>
        <Text style={styles.failureMessage}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onChangeLocation} style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}>
          <Text style={styles.changeText}>Choose another place</Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

function WeatherToGoApp() {
  const [hydrated, setHydrated] = useState(false);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<WeatherSnapshot | null>(null);
  const locationRef = useRef<LocationSelection | null>(null);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const loadWeather = useCallback(async (
    target: LocationSelection,
    kind: 'initial' | 'refresh' | 'background' = 'initial',
  ) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!snapshotRef.current || kind === 'initial') setLoading(true);
    if (kind === 'refresh') setRefreshing(true);
    setError(null);

    try {
      const nextSnapshot = await fetchWeather(target, controller.signal);
      if (controller.signal.aborted) return;
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      setStaleMessage(null);
      lastRefreshRef.current = Date.now();
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      const message = caught instanceof Error ? caught.message : 'Weather is unavailable right now.';
      if (snapshotRef.current) setStaleMessage('Showing the last update — it may be out of date.');
      else setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      let savedLocation: LocationSelection | null = null;
      let savedUnits: UnitSystem | null = null;

      try {
        const preferences = await readPreferences();
        savedLocation = preferences.location;
        savedUnits = preferences.units;
      } catch {
        // A clean local fallback keeps first launch moving if storage is unavailable.
      }

      const target = savedLocation?.source === 'geolocation'
        && (savedLocation.name === 'Current location' || savedLocation.name === 'Current area')
        ? await namedCurrentLocation(savedLocation.latitude, savedLocation.longitude)
        : savedLocation ?? await initialLocation();
      if (!mounted) return;

      setUnits(savedUnits ?? defaultUnitsForLocale(currentLocale()));
      setLocation(target);
      locationRef.current = target;
      setHydrated(true);
      if (!savedLocation) void saveLocation(target);
      void loadWeather(target, 'initial');
    })();

    return () => {
      mounted = false;
      requestRef.current?.abort();
    };
  }, [loadWeather]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active'
        && locationRef.current
        && Date.now() - lastRefreshRef.current > 15 * 60 * 1000
      ) {
        void loadWeather(locationRef.current, 'background');
      }
    });
    return () => subscription.remove();
  }, [loadWeather]);

  const chooseLocation = useCallback((nextLocation: LocationSelection) => {
    setPickerOpen(false);
    setLocationError(null);
    setLocation(nextLocation);
    locationRef.current = nextLocation;
    snapshotRef.current = null;
    setSnapshot(null);
    setStaleMessage(null);
    void saveLocation(nextLocation);
    void loadWeather(nextLocation, 'initial');
  }, [loadWeather]);

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationError('Location access was denied. Choose a city instead, or allow access in iPhone Settings.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      chooseLocation(await namedCurrentLocation(result.coords.latitude, result.coords.longitude));
    } catch {
      setLocationError('Your location couldn’t be read. Check Location Services or choose a city.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLocating(false);
    }
  }, [chooseLocation]);

  const toggleUnits = useCallback(() => {
    const nextUnits: UnitSystem = units === 'metric' ? 'imperial' : 'metric';
    setUnits(nextUnits);
    void saveUnits(nextUnits);
    void Haptics.selectionAsync();
  }, [units]);

  const retry = useCallback(() => {
    if (locationRef.current) void loadWeather(locationRef.current, snapshotRef.current ? 'refresh' : 'initial');
  }, [loadWeather]);

  if (!hydrated) return <LoadingScreen />;

  const content = !location || (loading && !snapshot) ? (
    <LoadingScreen />
  ) : error && !snapshot ? (
    <FailureScreen message={error} onChangeLocation={() => setPickerOpen(true)} onRetry={retry} />
  ) : snapshot ? (
    <WeatherHome
      location={location}
      onOpenLocation={() => setPickerOpen(true)}
      onRefresh={retry}
      onToggleUnits={toggleUnits}
      refreshing={refreshing}
      snapshot={snapshot}
      staleMessage={staleMessage}
      units={units}
    />
  ) : (
    <LoadingScreen />
  );

  return (
    <View style={styles.flex}>
      {content}
      <LocationPicker
        locating={locating}
        locationError={locationError}
        onChoose={chooseLocation}
        onClose={() => setPickerOpen(false)}
        onUseCurrentLocation={useCurrentLocation}
        visible={pickerOpen}
      />
      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <WeatherToGoApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  loadingMark: { alignItems: 'center', backgroundColor: 'rgba(4,17,28,0.3)', borderColor: 'rgba(255,255,255,0.11)', borderRadius: 31, borderWidth: StyleSheet.hairlineWidth, height: 62, justifyContent: 'center', width: 62 },
  spinner: { marginTop: 23 },
  loadingText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '600', marginTop: 12 },
  failure: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  failureIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.11)', borderRadius: 31, borderWidth: StyleSheet.hairlineWidth, height: 62, justifyContent: 'center', width: 62 },
  failureTitle: { color: '#FFFFFF', fontFamily: fonts.demi, fontSize: 30, fontWeight: '700', letterSpacing: -0.55, lineHeight: 36, marginTop: 21, textAlign: 'center' },
  failureMessage: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 320, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, justifyContent: 'center', marginTop: 28, minHeight: 54, width: '100%' },
  retryText: { color: '#183B53', fontSize: 16, fontWeight: '700' },
  changeButton: { alignItems: 'center', justifyContent: 'center', marginTop: 10, minHeight: 48, width: '100%' },
  changeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
