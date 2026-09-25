import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BitcoinGlyph } from '@/components/ui/BitcoinGlyph';
import { RefreshButton } from '@/components/RefreshButton';
import { Micro } from '@/components/ui/Micro';
import { useBtcSpot } from '@/hooks/useBtcMarket';
import { formatInteger, formatPercent, formatUsd } from '@/lib/format';
import { c, f, goldRadial, goldRadialLocations, perfColor } from '@/theme/tokens';

/**
 * Bandeau BTC, présent sur tous les onglets — avec, à droite du bloc, le
 * bouton ↻ qui actualise l'app.
 *
 * Quand CoinGecko ne répond plus, le prix reste affiché et un libellé
 * `HORS LIGNE` prend la place de la variation 24 h : on ne masque jamais la
 * dernière valeur connue, on la date (README §6).
 */
export function BtcTicker() {
  const { spot, blockHeight } = useBtcSpot();

  return (
    <View
      className="flex-row items-center gap-3 border-t border-b border-borderStrong"
      style={{
        marginHorizontal: 22,
        marginBottom: 16,
        paddingTop: 11,
        paddingBottom: 12,
        paddingHorizontal: 2,
      }}
    >
      <LinearGradient
        colors={[...goldRadial]}
        locations={[...goldRadialLocations]}
        start={{ x: 0.34, y: 0.28 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BitcoinGlyph size={13} />
      </LinearGradient>

      <Text
        style={{ fontFamily: f.labelMed, fontSize: 14, letterSpacing: -0.14, color: c.ivory }}
      >
        {formatUsd(spot.usd)}
      </Text>

      {spot.stale ? (
        <Micro tracking={1.8} style={{ color: c.oxbloodMuted }}>
          HORS LIGNE
        </Micro>
      ) : (
        <Text
          style={{ fontFamily: f.labelMed, fontSize: 10, color: perfColor(spot.change24h) }}
        >
          {formatPercent(spot.change24h, 2)}
        </Text>
      )}

      <View className="flex-1" />

      {blockHeight === null ? null : (
        <Micro tracking={1.26} style={{ color: c.sepiaMuted }}>
          {`BLOC ${formatInteger(blockHeight)}`}
        </Micro>
      )}

      {/* Actualiser l'app : une PWA installée n'a pas d'autre moyen. */}
      <RefreshButton />
    </View>
  );
}
