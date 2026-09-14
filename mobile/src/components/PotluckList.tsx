import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { usePotluckItems } from '@/features/potluck/usePotluckItems';
import { a, c, f } from '@/theme/tokens';
import type { Member, PotluckRow } from '@/types/domain';

export interface PotluckListProps {
  eventId: string;
  /** `null` tant que la session n'est pas résolue : la liste passe en lecture seule. */
  currentUserId: string | null;
  membersById: Map<string, Member>;
}

/**
 * Checklist « qui amène quoi », partagée en temps réel.
 *
 * Trois états par ligne, et un seul est cliquable en plus du sien :
 *   • **libre**        — `À PRENDRE` en or, pastille creuse ;
 *   • **à moi**        — pastille sauge cochée, re-tap pour se libérer ;
 *   • **à un autre**   — prénom + avatar, inerte.
 *
 * Toute la logique d'assignation vit dans `usePotluckItems` ; ce fichier ne
 * fait que la peindre. C'est ce qui permet de tester la règle métier sans
 * monter un arbre React.
 */
export function PotluckList({ eventId, currentUserId, membersById }: PotluckListProps) {
  const { rows, loading, error, notice, assignedCount, totalCount, toggle, reload } =
    usePotluckItems(eventId, currentUserId, membersById);

  const handleToggle = useCallback((itemId: string) => toggle(itemId), [toggle]);

  return (
    <View>
      <SectionTitle
        label="Qui amène quoi"
        hint={loading ? '…' : `${assignedCount} / ${totalCount}`}
      />

      {loading ? <PotluckSkeleton /> : null}

      {!loading && error ? <PotluckError message={error} onRetry={reload} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyPotluck />
      ) : (
        rows.map((row) => (
          <PotluckLine
            key={row.id}
            row={row}
            interactive={currentUserId !== null}
            onToggle={handleToggle}
          />
        ))
      )}

      {notice ? (
        <Text
          className="mt-3"
          style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 17, color: c.oxbloodMuted }}
        >
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

interface PotluckLineProps {
  row: PotluckRow;
  interactive: boolean;
  onToggle: (itemId: string) => void;
}

const PotluckLine = memo(function PotluckLine({ row, interactive, onToggle }: PotluckLineProps) {
  // Une ligne prise par un autre membre n'est pas « désactivée » au sens
  // visuel : elle est simplement inerte. Le design ne la grise pas.
  const pressable = interactive && !row.isLocked;

  const dialBackground = row.isFree
    ? 'transparent'
    : row.isMine
      ? c.sage
      : (row.assignee?.color ?? c.dial);

  const dialBorder = row.isFree ? c.dial : dialBackground;

  return (
    <Pressable
      accessibilityRole={pressable ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel(row)}
      accessibilityState={{ disabled: !pressable, checked: !row.isFree }}
      disabled={!pressable}
      onPress={() => onToggle(row.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: c.hairline,
        backgroundColor: pressed && pressable ? a.pressed : 'transparent',
        opacity: row.isPending ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: dialBorder,
          backgroundColor: dialBackground,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {row.isFree ? null : (
          <Text style={{ fontFamily: f.mono, fontSize: 8, color: c.onAvatar }}>✓</Text>
        )}
      </View>

      <Text
        className="flex-1"
        style={{
          fontFamily: f.sansMed,
          fontSize: 13,
          color: row.isFree ? c.sepia : c.bone,
        }}
      >
        {row.itemName}
      </Text>

      {row.isFree ? (
        <Micro tracking={1.8} style={{ color: c.goldMuted }}>
          À PRENDRE
        </Micro>
      ) : (
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: f.sans, fontSize: 11, color: c.sepia }}>
            {row.assignee?.displayName ?? '—'}
          </Text>
          <Avatar
            initials={row.assignee?.initials ?? '··'}
            color={row.assignee?.color ?? c.dial}
            size={20}
            dimmed={row.isPending}
          />
        </View>
      )}
    </Pressable>
  );
});

function accessibilityLabel(row: PotluckRow): string {
  if (row.isFree) return `${row.itemName}, à prendre`;
  if (row.isMine) return `${row.itemName}, vous l'apportez — toucher pour vous libérer`;
  return `${row.itemName}, apporté par ${row.assignee?.displayName ?? 'un membre'}`;
}

// ---------------------------------------------------------------------------
// États de chargement, d'erreur et vide — README §6.
// ---------------------------------------------------------------------------

/** Squelettes couleur surface, jamais de spinner coloré. */
function PotluckSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Chargement de la liste">
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          className="flex-row items-center gap-3 border-b border-hairline"
          style={{ paddingVertical: 12, paddingHorizontal: 2 }}
        >
          <View className="w-3.5 h-3.5 rounded-full bg-surface" />
          <View className="flex-1 h-3 rounded-sm bg-surface" style={{ maxWidth: 150 }} />
        </View>
      ))}
    </View>
  );
}

function PotluckError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 2 }}>
      <Text style={{ fontFamily: f.sans, fontSize: 12, lineHeight: 18, color: c.oxbloodMuted }}>
        {message}
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: 10 }}>
        <Micro tracking={1.8} style={{ color: c.goldMuted }}>
          RÉESSAYER
        </Micro>
      </Pressable>
    </View>
  );
}

function EmptyPotluck() {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 15,
        color: c.sepia,
        textAlign: 'center',
        paddingVertical: 22,
      }}
    >
      Rien à apporter pour l’instant
    </Text>
  );
}

/** Indicateur discret réutilisable par les écrans qui rafraîchissent la liste. */
export function PotluckSpinner() {
  return <ActivityIndicator color={c.gold} size="small" />;
}
