import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { SCORE_TABLE, VOTER_SHARE } from '@/features/bag/callPoints';
import { formatPoints } from '@/lib/format';
import { OPEN_HORIZONS, formatWeight } from '@/lib/horizons';
import { c, f } from '@/theme/tokens';

/** Les colonnes chiffrées, de même largeur : les points s'alignent. */
const COLUMN = 58;

const tone = (value: number) =>
  value > 0 ? c.sage : value < 0 ? c.oxbloodMuted : c.sepiaFaint;

const WEIGHTS = OPEN_HORIZONS.map(
  (h) => `${formatWeight(h.weight)} pour ${h.long.toLowerCase()}`,
).join(', ');

/**
 * Le barème, tel que le calcule `callPoints.ts` — c'est la même table, pas une
 * copie : l'écran ne peut pas mentir sur les règles.
 */
export function ScoreTable() {
  return (
    <View>
      <Text
        style={{ fontFamily: f.serifItalic, fontSize: 16, lineHeight: 22, color: c.parchment }}
      >
        {`Celui qui fait le call prend 100 % des points ; ceux qui votent dessus en prennent ${Math.round(
          VOTER_SHARE * 100,
        )} %, arrondis à l’entier.`}
      </Text>

      <View
        className="flex-row border-b border-border"
        style={{ marginTop: 14, paddingBottom: 7, paddingHorizontal: 2 }}
      >
        <Micro size={8} tracking={1.4} style={{ flex: 1, color: c.sepiaMuted }}>
          PERF DU CALL
        </Micro>
        {['AUTEUR', 'BULL', 'BEAR'].map((label) => (
          <Micro
            key={label}
            size={8}
            tracking={1.4}
            style={{ width: COLUMN, textAlign: 'right', color: c.sepiaMuted }}
          >
            {label}
          </Micro>
        ))}
      </View>

      {SCORE_TABLE.map((row, index) => {
        // Un filet plus marqué entre les hausses et les baisses.
        const turn = (SCORE_TABLE[index - 1]?.author ?? 0) > 0 && row.author < 0;
        return (
          <View
            key={row.label}
            className="flex-row items-center"
            style={{
              paddingVertical: 7,
              paddingHorizontal: 2,
              borderTopWidth: turn ? 1 : 0,
              borderTopColor: c.borderLift,
              borderBottomWidth: 1,
              borderBottomColor: c.hairline,
            }}
          >
            <Text style={{ flex: 1, fontFamily: f.label, fontSize: 11.5, color: c.bone }}>
              {row.label}
            </Text>
            {[row.author, row.bull, row.bear].map((value, column) => (
              <Text
                key={column}
                style={{
                  width: COLUMN,
                  textAlign: 'right',
                  fontFamily: column === 0 ? f.labelSemi : f.labelMed,
                  fontSize: 11.5,
                  color: tone(value),
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatPoints(value)}
              </Text>
            ))}
          </View>
        );
      })}

      <View style={{ gap: 8, marginTop: 14 }}>
        <Rule>
          La perf est celle du call en dollars, depuis son prix d’entrée. Un call en cours est
          noté à son cours du moment : ses points sont en jeu et bougent avec le marché. À sa
          clôture, ils sont acquis — et comptent pour l’année de la clôture.
        </Rule>
        <Rule>
          Un vote se fait dans les 72 heures qui suivent la publication, avec une phrase qui
          l’explique. On peut changer de camp une seule fois ; retirer son vote compte comme ce
          changement, et il est définitif. On ne vote pas sur son propre call.
        </Rule>
        <Rule>
          {`Oracle : chaque pari résolu rapporte sa justesse (de 0 à 100), multipliée selon la longueur de la prévision dessinée — ${WEIGHTS}. Viser juste de loin est plus dur ; un pari court, lui, se rejoue chaque semaine. Ces points s’ajoutent à ceux des calls.`}
        </Rule>
      </View>
    </View>
  );
}

function Rule({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 17, color: c.sepiaMuted }}>
      {children}
    </Text>
  );
}
