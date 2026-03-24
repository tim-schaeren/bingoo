import { Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../constants/theme';

interface BrandWordmarkProps {
  style?: StyleProp<TextStyle>;
  accentStyle?: StyleProp<TextStyle>;
  uppercase?: boolean;
  suffix?: string;
}

export function BrandWordmark({
  style,
  accentStyle,
  uppercase = false,
  suffix = '',
}: BrandWordmarkProps) {
  const prefix = uppercase ? 'BING' : 'bing';
  const accent = uppercase ? 'O' : 'o';
  const tail = `${uppercase ? 'O' : 'o'}${suffix}`;

  return (
    <Text style={style}>
      {prefix}
      <Text style={[{ color: colors.secondary }, accentStyle]}>{accent}</Text>
      {tail}
    </Text>
  );
}
