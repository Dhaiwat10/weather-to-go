import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { searchLocations } from '../services/api';
import type { LocationSelection } from '../domain/types';
import { fonts, Text } from './AppText';
import { AppSymbol } from './AppSymbol';
import { GlassSurface } from './GlassSurface';

interface LocationPickerProps {
  visible: boolean;
  onClose: () => void;
  onChoose: (location: LocationSelection) => void;
  onUseCurrentLocation: () => void;
  locating: boolean;
  locationError: string | null;
}

function locale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
}

export function LocationPicker({
  visible,
  onClose,
  onChoose,
  onUseCurrentLocation,
  locating,
  locationError,
}: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSelection[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setSearchError(null);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        setResults(await searchLocations(trimmed, locale(), controller.signal));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSearchError('Couldn’t search right now. Check your connection and try again.');
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const select = (location: LocationSelection) => {
    void Haptics.selectionAsync();
    onChoose(location);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={['#172A3A', '#102332', '#081722']} style={styles.flex}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Choose a place</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close location picker"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <GlassSurface
                pointerEvents="none"
                style={styles.closeGlass}
                tintColor="rgba(15, 48, 78, 0.08)"
              />
              <AppSymbol name="xmark" size={19} weight="medium" />
            </Pressable>
          </View>

          <GlassSurface style={styles.searchBox} tintColor="rgba(17, 54, 87, 0.2)">
            <AppSymbol name="magnifyingglass" size={18} style={styles.searchIcon} tintColor="rgba(255,255,255,0.78)" weight="medium" />
            <TextInput
              accessibilityLabel="Search for a city or postal code"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="City or postal code"
              placeholderTextColor="rgba(255,255,255,0.5)"
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            {searching ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          </GlassSurface>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            disabled={locating}
            onPress={onUseCurrentLocation}
            style={({ pressed }) => [styles.currentButton, pressed && styles.pressed]}
          >
            <View style={styles.currentIcon}><AppSymbol name="location.fill" size={19} /></View>
            <View style={styles.currentCopy}>
              <Text style={styles.currentTitle}>{locating ? 'Finding you…' : 'Use my location'}</Text>
            </View>
            {locating ? <ActivityIndicator color="#FFFFFF" /> : <AppSymbol name="chevron.right" size={15} style={styles.chevron} tintColor="rgba(255,255,255,0.58)" weight="semibold" />}
          </Pressable>

          {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
          {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

          <ScrollView
            contentContainerStyle={styles.results}
            keyboardShouldPersistTaps="handled"
          >
            {trimmed.length >= 2 && !searching && !searchError && results.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No places found</Text>
                <Text style={styles.emptyDetail}>Try a nearby city or a broader spelling.</Text>
              </View>
            ) : null}
            {results.map((location) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show weather for ${location.displayName}`}
                key={`${location.id ?? location.displayName}-${location.latitude}`}
                onPress={() => select(location)}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
              >
                <View style={styles.pin}><AppSymbol name="mappin" size={19} tintColor="rgba(255,255,255,0.78)" weight="medium" /></View>
                <View style={styles.resultCopy}>
                  <Text numberOfLines={1} style={styles.resultName}>{location.name}</Text>
                  <Text numberOfLines={1} style={styles.resultDetail}>
                    {[location.admin1, location.country].filter(Boolean).join(', ') || 'Search result'}
                  </Text>
                </View>
                <AppSymbol name="chevron.right" size={15} style={styles.chevron} tintColor="rgba(255,255,255,0.58)" weight="semibold" />
              </Pressable>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 24,
  },
  title: { color: '#FFFFFF', fontFamily: fonts.demi, fontSize: 29, fontWeight: '700', letterSpacing: -0.6, lineHeight: 36 },
  closeButton: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', overflow: 'hidden', width: 46 },
  closeGlass: { ...StyleSheet.absoluteFillObject, borderColor: 'rgba(255,255,255,0.11)', borderRadius: 23, borderWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  searchBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,17,28,0.36)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: 24,
    minHeight: 62,
    paddingHorizontal: 18,
    shadowColor: '#02070D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  searchIcon: { marginRight: 11 },
  input: { color: '#FFFFFF', flex: 1, fontFamily: fonts.regular, fontSize: 16, minHeight: 58, paddingVertical: 13 },
  currentButton: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: 24,
    paddingVertical: 20,
  },
  currentIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  currentCopy: { flex: 1, marginLeft: 12 },
  currentTitle: { color: '#FFFFFF', fontFamily: fonts.demi, fontSize: 16, fontWeight: '600' },
  chevron: { marginLeft: 8 },
  error: { color: '#FFD8D4', fontSize: 13, lineHeight: 19, marginHorizontal: 24, marginTop: 2 },
  results: { paddingBottom: 36, paddingHorizontal: 24 },
  result: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.09)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 72 },
  resultPressed: { backgroundColor: 'rgba(255,255,255,0.055)' },
  pin: { alignItems: 'center', height: 30, justifyContent: 'center', width: 28 },
  resultCopy: { flex: 1, marginHorizontal: 13 },
  resultName: { color: '#FFFFFF', fontFamily: fonts.demi, fontSize: 16, fontWeight: '600' },
  resultDetail: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 3 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 45 },
  emptyTitle: { color: '#FFFFFF', fontFamily: fonts.demi, fontSize: 21, fontWeight: '600', letterSpacing: -0.25 },
  emptyDetail: { color: 'rgba(255,255,255,0.56)', fontSize: 14, marginTop: 7, textAlign: 'center' },
});
