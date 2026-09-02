import { Platform, Text as NativeText, type TextProps } from 'react-native';

export const fonts = {
  regular: Platform.select({ ios: 'System', default: 'sans-serif' }),
  medium: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
  demi: Platform.select({ ios: 'System', default: 'sans-serif' }),
};

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: fonts.regular }, style]} />;
}
