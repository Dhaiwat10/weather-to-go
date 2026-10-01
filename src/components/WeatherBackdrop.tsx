import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type WeatherTheme = 'clear' | 'cloud' | 'rain' | 'snow' | 'storm' | 'night';

const palettes: Record<WeatherTheme, readonly [string, string, string]> = {
  clear: ['#4B7898', '#244E6D', '#0A2439'],
  cloud: ['#626F78', '#344550', '#101D27'],
  rain: ['#465761', '#263844', '#0B1822'],
  snow: ['#81939E', '#50636F', '#263945'],
  storm: ['#303C47', '#182630', '#07121A'],
  night: ['#172A4A', '#0B1830', '#030914'],
};

const glowColors: Record<WeatherTheme, readonly [string, string]> = {
  clear: ['rgba(255,222,150,0.18)', 'rgba(255,222,150,0)'],
  cloud: ['rgba(235,244,248,0.09)', 'rgba(235,244,248,0)'],
  rain: ['rgba(197,225,236,0.07)', 'rgba(197,225,236,0)'],
  snow: ['rgba(246,251,255,0.14)', 'rgba(246,251,255,0)'],
  storm: ['rgba(170,194,209,0.055)', 'rgba(170,194,209,0)'],
  night: ['rgba(91,127,190,0.08)', 'rgba(91,127,190,0)'],
};

const rainStreaks = Array.from({ length: 7 }, (_, index) => index);
const stars = Array.from({ length: 10 }, (_, index) => index);

export function WeatherBackdrop({
  isDay,
  scrollY,
  theme,
}: {
  isDay: boolean;
  scrollY: Animated.Value;
  theme: WeatherTheme;
}) {
  const farParallax = scrollY.interpolate({
    extrapolate: 'clamp',
    inputRange: [-120, 650],
    outputRange: [20, -48],
  });
  const nearParallax = scrollY.interpolate({
    extrapolate: 'clamp',
    inputRange: [-120, 650],
    outputRange: [34, -92],
  });
  const paletteTheme = !isDay && (theme === 'clear' || theme === 'cloud') ? 'night' : theme;
  const wet = theme === 'rain' || theme === 'storm';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={palettes[paletteTheme]}
        end={{ x: 0.78, y: 1 }}
        locations={[0, 0.46, 1]}
        start={{ x: 0.16, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.glowLayer, { transform: [{ translateY: farParallax }] }]}>
        <LinearGradient
          colors={glowColors[paletteTheme]}
          end={{ x: 0.12, y: 1 }}
          start={{ x: 0.82, y: 0 }}
          style={styles.glow}
        />
      </Animated.View>

      {theme === 'night' ? (
        <Animated.View style={[styles.starLayer, { transform: [{ translateY: farParallax }] }]}>
          {stars.map((star) => (
            <View
              key={star}
              style={[
                styles.star,
                {
                  left: `${8 + ((star * 23) % 88)}%`,
                  opacity: 0.2 + (star % 3) * 0.13,
                  top: 34 + ((star * 47) % 330),
                },
              ]}
            />
          ))}
        </Animated.View>
      ) : null}

      {wet ? (
        <Animated.View style={[styles.rainLayer, { transform: [{ translateY: nearParallax }] }]}>
          {rainStreaks.map((streak) => (
            <View
              key={streak}
              style={[
                styles.rainStreak,
                {
                  left: `${4 + streak * 10}%`,
                  opacity: 0.08 + (streak % 3) * 0.035,
                  top: 90 + ((streak * 61) % 390),
                },
              ]}
            />
          ))}
        </Animated.View>
      ) : null}

      <LinearGradient
        colors={['rgba(2,9,17,0.03)', 'rgba(2,10,19,0.16)', 'rgba(1,7,14,0.58)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glowLayer: { height: 420, position: 'absolute', right: -170, top: -190, width: 450 },
  glow: { borderRadius: 225, flex: 1 },
  starLayer: { ...StyleSheet.absoluteFill },
  star: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 3, position: 'absolute', width: 3 },
  rainLayer: { ...StyleSheet.absoluteFill },
  rainStreak: { backgroundColor: '#DDF4FF', borderRadius: 1, height: 46, position: 'absolute', transform: [{ rotate: '14deg' }], width: 1 },
});
