import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

interface GlassSurfaceProps {
  accessibilityLabel?: string;
  accessible?: boolean;
  intensity?: number;
  interactive?: boolean;
  pointerEvents?: ViewProps['pointerEvents'];
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}

function hasNativeLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export const nativeLiquidGlassAvailable = hasNativeLiquidGlass();

export function GlassSurface({
  accessibilityLabel,
  accessible,
  children,
  intensity = 42,
  interactive = false,
  pointerEvents,
  style,
  tintColor = 'rgba(6, 20, 34, 0.22)',
}: PropsWithChildren<GlassSurfaceProps>) {
  if (nativeLiquidGlassAvailable) {
    return (
      <GlassView
        colorScheme="dark"
        accessibilityLabel={accessibilityLabel}
        accessible={accessible}
        glassEffectStyle="clear"
        isInteractive={interactive}
        pointerEvents={pointerEvents}
        style={[style, styles.nativeSurface]}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      intensity={intensity}
      pointerEvents={pointerEvents}
      style={style}
      tint="dark"
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  nativeSurface: { backgroundColor: 'transparent' },
});
