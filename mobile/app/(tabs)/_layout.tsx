import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Micro } from '@/components/ui/Micro';
import { c } from '@/theme/tokens';

/**
 * Les props de la tab bar sont dérivées du composant `Tabs` plutôt
 * qu'importées de `@react-navigation/bottom-tabs` : expo-router embarque sa
 * propre copie de react-navigation et n'en réexporte pas les types.
 */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const LABELS: Record<string, string> = {
  index: 'NIGHTS',
  bag: 'LE BAG',
  oracle: 'ORACLE',
};

/**
 * Tab bar entièrement personnalisée.
 *
 * Le trait indicateur de 1 px pleine largeur et l'absence totale d'icône ne
 * s'obtiennent pas avec la tab bar par défaut (README §8.10). L'absence
 * d'icônes est un choix de design, pas un oubli.
 */
function ClubTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row border-t border-hairline bg-ink"
      style={{
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 24 + insets.bottom,
        gap: 6,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = LABELS[route.name] ?? route.name.toUpperCase();

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            className="flex-1 items-center"
            style={{ gap: 8 }}
          >
            <View
              style={{
                width: '100%',
                height: 1,
                backgroundColor: focused ? c.gold : 'transparent',
              }}
            />
            <Micro tracking={1.8} style={{ color: focused ? c.gold : c.sepiaMuted }}>
              {label}
            </Micro>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <ClubTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.ink } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="bag" />
      <Tabs.Screen name="oracle" />
    </Tabs>
  );
}
