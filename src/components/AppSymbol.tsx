import { Text as NativeText, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol, type SymbolViewProps } from 'expo-symbols';

export type AppSymbolName = SFSymbol;

export function AppSymbol({
  fallback = '•',
  name,
  size = 22,
  style,
  tintColor = '#FFFFFF',
  type = 'monochrome',
  weight = 'regular',
}: {
  fallback?: string;
  name: SFSymbol;
  size?: number;
  style?: StyleProp<ViewStyle>;
  tintColor?: ColorValue;
  type?: SymbolViewProps['type'];
  weight?: SymbolViewProps['weight'];
}) {
  return (
    <SymbolView
      accessible={false}
      fallback={(
        <View style={[styles.fallback, { height: size, width: size }]}>
          <NativeText style={[styles.fallbackText, { color: tintColor, fontSize: size * 0.72 }]}>{fallback}</NativeText>
        </View>
      )}
      name={name}
      resizeMode="scaleAspectFit"
      size={size}
      style={[{ height: size, width: size }, style]}
      tintColor={tintColor}
      type={type}
      weight={weight}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { lineHeight: 22, textAlign: 'center' },
});
