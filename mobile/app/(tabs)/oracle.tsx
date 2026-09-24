import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { OracleCanvas } from '@/components/OracleCanvas';
import type { OracleCurve } from '@/components/OracleGraph';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenShell } from '@/components/ScreenShell';
import { TimeLockCard } from '@/components/TimeLockCard';
import { Avatar } from '@/components/ui/Avatar';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { DAY_MS } from '@/features/oracle/betting';
import { useOracle, type BetView } from '@/features/oracle/useOracle';
import { useBtcSpot } from '@/hooks/useBtcMarket';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { accuracyLabel } from '@/lib/accuracy';
import { calendarTicks } from '@/lib/calendarTicks';
import {
  formatClubDate,
  formatCountdown,
  formatLeft,
  formatTarget,
  formatUsd,
} from '@/lib/format';
import {
  DEFAULT_HORIZON,
  HORIZONS,
  editingLabel,
  horizonOf,
  type HorizonKey,
} from '@/lib/horizons';
import { CLUB_SIZE } from '@/mocks/members';
import { a, c, f, radius } from '@/theme/tokens';

/** Membre dont la courbe est en pointillés dans le design de référence. */
const DASHED_MEMBER = 'Marco';

/** Au-delà, une confirmation restée en attente n'est plus une confirmation. */
const CONFIRM_WINDOW_MS = 4000;

/** Paris clos affichés avant « voir tout » : l'historique ne fait que grandir. */
const HISTORY_PREVIEW = 8;

/**
 * Onglet Oracle — des paris sur le cours du bitcoin, tracés au doigt.
 *
 * Une semaine, trois mois, dix ans : chaque horizon a ses paris, qui courent
 * en parallèle et suivent chacun leur calendrier. On en choisit un en haut ;
 * tout l'écran — repère, cadenas, liste — parle alors de celui-là. Seul
 * l'historique, en bas, les mélange : c'est là qu'on relit qui avait vu juste.
 */
export default function OracleScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const { spot } = useBtcSpot();
  const [horizon, setHorizon] = useState<HorizonKey>(DEFAULT_HORIZON);
  const oracle = useOracle(userId, byId, horizon);
  const { window, mine, club, draft, dirty, saving, drawRange, now } = oracle;

  const [showOthers, setShowOthers] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);
  /**
   * L'effacement demande confirmation, en deux temps sur le même bouton.
   *
   * Une `Alert` système ne s'affiche pas de la même façon sur le web et sur
   * iOS, et sortirait du registre de l'écran. Le libellé change, vire à
   * l'oxblood, et redevient lui-même si on ne confirme pas.
   */
  const [confirmingClear, setConfirmingClear] = useState(false);
  /** Toucher la toile sur un tracé existant ouvre cette fenêtre, sans rien effacer. */
  const [askingRedraw, setAskingRedraw] = useState(false);
  /** « Débloquer » retire un pari verrouillé : ça se confirme aussi. */
  const [askingUnlock, setAskingUnlock] = useState(false);

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  const me = userId ? (byId.get(userId) ?? null) : null;
  const h = horizonOf(horizon);

  const timeTicks = useMemo(
    () => calendarTicks(window.origin, window.days),
    [window.origin, window.days],
  );

  const curves = useMemo<OracleCurve[]>(
    () =>
      club.map((view) => ({
        id: view.bet.id,
        color: view.author.color,
        path: view.onChart,
        dashed: view.author.displayName === DASHED_MEMBER,
      })),
    [club],
  );

  /** Mon pari d'abord, puis ceux du club dans l'ordre où ils ont été ouverts. */
  const running = useMemo(
    () => [
      ...(mine ? [mine] : []),
      ...club.slice().sort((x, y) => x.bet.openedAt - y.bet.openedAt),
    ],
    [mine, club],
  );

  const sealed = mine?.phase === 'locked';
  const hasDraft = draft.length > 1;
  const resolvesAt = mine?.bet.resolvesAt ?? now + h.days * DAY_MS;

  const hint = drawRange
    ? 'Tracez votre pari au doigt, à partir d’aujourd’hui'
    : userId
      ? null
      : 'Connectez-vous pour parier';

  // --- Le bouton sous le repère : effacer, retirer, ou revenir ----------------
  //
  // Trois gestes différents, et les confondre coûterait un pari :
  //   • un brouillon jamais déposé s'efface ;
  //   • un tracé modifié revient au pari déposé — sans confirmation, rien ne se perd ;
  //   • un pari déposé, encore révisable, se retire — avec confirmation.
  const clearAction: { label: string; confirm: string | null; run: () => void } | null = sealed
    ? null
    : mine && dirty
      ? { label: 'REVENIR AU PARI DÉPOSÉ', confirm: null, run: oracle.revert }
      : mine
        ? { label: 'RETIRER MON PARI', confirm: 'CONFIRMER LE RETRAIT', run: oracle.clear }
        : hasDraft
          ? { label: 'EFFACER MON TRACÉ', confirm: 'CONFIRMER L’EFFACEMENT', run: oracle.clear }
          : null;

  return (
    <ScreenShell overline={`Paris BTC · ${h.long.toLowerCase()}`} title="L’Oracle" me={me}>
      <View style={{ gap: 20 }}>
        <HorizonPicker
          value={horizon}
          summary={oracle.summary}
          onChange={(key) => {
            setHorizon(key);
            setConfirmingClear(false);
          }}
        />

        {mine?.phase === 'open' ? (
          <LockCountdown lockedAt={mine.bet.lockedAt} />
        ) : sealed && mine ? (
          <TimeLockCard
            locked
            title="VERROUILLÉ · JUGÉ LE"
            value={`${formatClubDate(mine.bet.resolvesAt)} · ${formatLeft(mine.bet.resolvesAt - now)}`}
          />
        ) : (
          <TimeLockCard
            locked={false}
            title={`RÉVISABLE ${editingLabel(horizon)} APRÈS LE DÉPÔT`}
            value={`Jugé le ${formatClubDate(resolvesAt)}`}
          />
        )}

        <View>
          <View className="flex-row items-end justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Micro>{`BTC / USD · ${h.label}`}</Micro>
              <Text style={{ fontFamily: f.serif, fontSize: 26, color: c.ivory, marginTop: 8 }}>
                {formatUsd(spot.usd)}
              </Text>
            </View>
            <View className="items-end">
              <Micro tracking={0.9} size={9} style={{ color: c.sepiaMuted, lineHeight: 16 }}>
                {mine
                  ? `JOUR ${Math.max(0, Math.floor((now - mine.bet.openedAt) / DAY_MS))} / ${h.days}`
                  : running.length === 0
                    ? 'AUCUN PARI EN COURS'
                    : `${running.length} PARI${running.length > 1 ? 'S' : ''} EN COURS`}
              </Micro>
              <Micro tracking={0.9} size={9} style={{ color: c.sepiaMuted, lineHeight: 16 }}>
                {`JUGÉ LE ${formatClubDate(resolvesAt)}`}
              </Micro>
            </View>
          </View>

          <OracleCanvas
            frame={oracle.frame}
            btc={oracle.btc}
            today={window.today}
            timeTicks={timeTicks}
            curves={curves}
            showOthers={showOthers}
            path={draft}
            color={me?.color ?? c.ivory}
            drawRange={drawRange}
            sealed={sealed}
            hint={hint}
            onPathChange={oracle.setDraft}
            onRequestRedraw={() => setAskingRedraw(true)}
          />

          {oracle.btcUnavailable ? (
            <Micro tracking={1.2} style={{ color: c.oxblood, marginTop: 10 }}>
              COURS INDISPONIBLE — LA JUSTESSE ATTENDRA
            </Micro>
          ) : null}

          <View className="flex-row" style={{ paddingTop: 14, gap: 24 }}>
            <Pressable accessibilityRole="button" onPress={() => setShowOthers((on) => !on)}>
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: showOthers ? c.gold : c.sepiaMuted,
                }}
              >
                {showOthers ? 'MASQUER LE CLUB' : `VOIR LE CLUB (${curves.length})`}
              </Text>
            </Pressable>

            {sealed ? (
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 9,
                  letterSpacing: 1.62,
                  color: c.sepiaFaint,
                }}
              >
                {`FIGÉ · EMPREINTE ${mine?.bet.hash ?? '····'}`}
              </Text>
            ) : clearAction ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => {
                  if (!clearAction.confirm || confirmingClear) {
                    setConfirmingClear(false);
                    clearAction.run();
                  } else {
                    setConfirmingClear(true);
                  }
                }}
              >
                <Text
                  style={{
                    fontFamily: f.labelMed,
                    fontSize: 9,
                    letterSpacing: 1.62,
                    color: confirmingClear && clearAction.confirm ? c.oxblood : c.sepiaDim,
                  }}
                >
                  {confirmingClear && clearAction.confirm
                    ? clearAction.confirm
                    : clearAction.label}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Verrouillé, mais personne d'autre n'a parié : rien ne justifie de
              bloquer l'horizon. On peut retirer son pari et en ouvrir un neuf. */}
          {sealed && oracle.unlockable ? (
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setAskingUnlock(true)}
              style={{
                marginTop: 14,
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: radius.button,
                borderWidth: 1,
                borderColor: a.rsvpGoldBorder,
              }}
            >
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 10,
                  letterSpacing: 1.8,
                  color: c.gold,
                }}
              >
                {saving ? 'RETRAIT…' : `DÉBLOQUER MON PARI · ${h.label}`}
              </Text>
            </Pressable>
          ) : null}

          {/* Le tracé ne part pas tout seul : il se dépose. */}
          {drawRange && hasDraft ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !dirty || saving }}
              disabled={!dirty || saving}
              onPress={oracle.save}
              style={{
                marginTop: 14,
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: radius.button,
                borderWidth: 1,
                backgroundColor: dirty ? a.rsvpGoldBg : 'transparent',
                borderColor: dirty ? a.rsvpGoldBorder : c.border,
              }}
            >
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 10,
                  letterSpacing: 1.8,
                  color: saving ? c.sepiaMuted : dirty ? c.gold : c.sage,
                }}
              >
                {saving
                  ? 'ENREGISTREMENT…'
                  : !mine
                    ? `DÉPOSER MON PARI · ${h.label}`
                    : dirty
                      ? 'METTRE À JOUR MON PARI'
                      : 'PARI DÉPOSÉ'}
              </Text>
            </Pressable>
          ) : null}

          {oracle.error ? (
            <Text
              style={{
                marginTop: 10,
                fontFamily: f.sans,
                fontSize: 12,
                lineHeight: 17,
                color: c.oxblood,
              }}
            >
              {oracle.error}
            </Text>
          ) : null}

          {mine && mine.accuracy !== null ? (
            <View
              className="flex-row items-baseline justify-between"
              style={{ marginTop: 14, paddingHorizontal: 2 }}
            >
              <Micro tracking={1.6} style={{ color: c.sepiaMuted }}>
                {`MA JUSTESSE · ${accuracyLabel(mine.accuracy)}`}
              </Micro>
              <Text
                style={{
                  fontFamily: f.labelMed,
                  fontSize: 13,
                  color: accuracyColor(mine.accuracy),
                }}
              >
                {`${mine.accuracy.toFixed(0)} %`}
              </Text>
            </View>
          ) : null}
        </View>

        <View>
          <SectionTitle
            label={`PARIS EN COURS · ${h.label}`}
            hint={`${running.length} / ${CLUB_SIZE} MEMBRES`}
          />
          {running.length === 0 ? (
            <EmptyLine>
              {oracle.loading
                ? 'Chargement des paris…'
                : 'Personne n’a encore parié sur cet horizon.'}
            </EmptyLine>
          ) : (
            running.map((view) => (
              <BetLine
                key={view.bet.id}
                view={view}
                detail={`OUVERT LE ${formatClubDate(view.bet.openedAt)}`}
                status={
                  view.accuracy !== null
                    ? null
                    : view.phase === 'open'
                      ? 'RÉVISABLE'
                      : 'EN ATTENTE'
                }
              />
            ))
          )}
        </View>

        <View>
          <SectionTitle label="HISTORIQUE DES PARIS" hint={`${oracle.history.length} CLOS`} />
          {oracle.history.length === 0 ? (
            <EmptyLine>Aucun pari clos pour l’instant.</EmptyLine>
          ) : (
            <>
              {(showAllHistory ? oracle.history : oracle.history.slice(0, HISTORY_PREVIEW)).map(
                (view) => (
                  <BetLine
                    key={view.bet.id}
                    view={view}
                    detail={`${horizonOf(view.bet.horizon).label} · ${formatClubDate(view.bet.resolvesAt)}`}
                    status={view.accuracy === null ? 'SANS COURS' : null}
                  />
                ),
              )}
              {oracle.history.length > HISTORY_PREVIEW ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAllHistory((all) => !all)}
                  style={{ paddingVertical: 12 }}
                >
                  <Text
                    style={{
                      fontFamily: f.labelMed,
                      fontSize: 9,
                      letterSpacing: 1.62,
                      color: c.gold,
                    }}
                  >
                    {showAllHistory
                      ? 'RÉDUIRE'
                      : `VOIR LES ${oracle.history.length - HISTORY_PREVIEW} AUTRES`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>

      <ConfirmDialog
        visible={askingUnlock}
        title="Débloquer ce pari ?"
        message={
          mine && mine.bet.path.length < 2
            ? 'Ce pari n’a pas de tracé : il sera retiré, et vous pourrez en déposer un vrai, avec un nouveau calendrier.'
            : 'Personne d’autre n’a parié sur cet horizon. Votre pari verrouillé sera retiré, et vous pourrez en déposer un nouveau, avec un nouveau calendrier.'
        }
        confirmLabel="DÉBLOQUER"
        onCancel={() => setAskingUnlock(false)}
        onConfirm={() => {
          setAskingUnlock(false);
          oracle.unlock();
        }}
      />

      <ConfirmDialog
        visible={askingRedraw}
        title="Effacer votre tracé ?"
        message={
          mine
            ? 'Votre pari déposé reste enregistré tant que vous ne déposez pas le nouveau tracé.'
            : 'Le tracé en cours sera effacé, pour que vous puissiez en dessiner un autre.'
        }
        confirmLabel="EFFACER"
        onCancel={() => setAskingRedraw(false)}
        onConfirm={() => {
          setAskingRedraw(false);
          // Une toile vierge : le prochain geste dessine. Le pari déposé, lui,
          // ne bouge pas avant un nouveau dépôt.
          oracle.setDraft([]);
        }}
      />
    </ScreenShell>
  );
}

// ---------------------------------------------------------------------------

/**
 * Le choix de l'horizon.
 *
 * Six segments de largeur égale plutôt qu'une liste qui défile : on voit
 * d'un coup d'œil tous les horizons, et un point signale ceux où j'ai un pari
 * en cours — or s'il est encore révisable, oxblood s'il est verrouillé.
 */
function HorizonPicker({
  value,
  summary,
  onChange,
}: {
  value: HorizonKey;
  summary: ReturnType<typeof useOracle>['summary'];
  onChange: (key: HorizonKey) => void;
}) {
  return (
    <View className="flex-row" style={{ gap: 6 }} accessibilityRole="tablist">
      {HORIZONS.map(({ key, label, long }) => {
        const active = key === value;
        const mine = summary[key].mine;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${long}${mine ? ', vous avez un pari en cours' : ''}`}
            onPress={() => onChange(key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 9,
              borderRadius: radius.button,
              borderWidth: 1,
              borderColor: active ? a.rsvpGoldBorder : c.border,
              backgroundColor: active ? a.rsvpGoldBg : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: f.labelMed,
                fontSize: 9,
                letterSpacing: 0.9,
                color: active ? c.gold : c.sepiaDim,
              }}
            >
              {label}
            </Text>
            {mine ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: mine === 'locked' ? c.oxblood : c.gold,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Le compte à rebours du verrouillage, à la seconde.
 *
 * Isolé dans son composant : c'est le seul élément qui change chaque seconde,
 * et le reste de l'écran — le repère en tête — n'a pas à se redessiner avec lui.
 */
function LockCountdown({ lockedAt }: { lockedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <TimeLockCard
      locked={false}
      title="VERROUILLAGE DANS"
      value={formatCountdown(lockedAt - now)}
    />
  );
}

function BetLine({
  view,
  detail,
  status,
}: {
  view: BetView;
  detail: string;
  /** Remplace la justesse quand elle n'a pas encore de sens. */
  status: string | null;
}) {
  const { author, target, accuracy } = view;
  return (
    <View
      className="flex-row items-center border-b border-hairline"
      style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 2 }}
    >
      <View style={{ width: 14, height: 1.5, backgroundColor: author.color }} />
      <Avatar
        initials={author.initials}
        color={author.color}
        photo={author.avatarUrl}
        size={24}
      />
      <View className="flex-1" style={{ gap: 3 }}>
        <Text numberOfLines={1} style={{ fontFamily: f.sansSemi, fontSize: 12, color: c.bone }}>
          {author.displayName}
        </Text>
        <Micro tracking={0.8} size={8} numberOfLines={1} style={{ color: c.sepiaMuted }}>
          {detail}
        </Micro>
      </View>
      <Text style={{ fontFamily: f.label, fontSize: 11, color: c.sepia }}>
        {target === null ? '—' : formatTarget(target)}
      </Text>
      <Text
        style={{
          width: 72,
          textAlign: 'right',
          fontFamily: f.label,
          fontSize: 9,
          letterSpacing: 1.08,
          color: status !== null || accuracy === null ? c.sepiaFaint : accuracyColor(accuracy),
        }}
      >
        {status ?? (accuracy === null ? '—' : `${accuracy.toFixed(0)} % JUSTE`)}
      </Text>
    </View>
  );
}

function EmptyLine({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 14,
        color: c.sepia,
        paddingVertical: 14,
        paddingHorizontal: 2,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * La couleur d'un score de justesse.
 *
 * Les seuils suivent ceux de `ACCURACY_TIERS` pour que la couleur et le mot ne
 * puissent pas se contredire.
 */
function accuracyColor(percent: number): string {
  if (percent >= 90) return c.sage;
  if (percent >= 70) return c.gold;
  return c.oxblood;
}
