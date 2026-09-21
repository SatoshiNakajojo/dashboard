/**
 * Ce qu'on dit aux six autres quand quelqu'un tape « Je viens ».
 *
 * Mettre à jour la liste des présents en silence, ce n'est pas prévenir : la
 * pastille d'un avatar qui apparaît pendant qu'on regarde ailleurs ne se voit
 * pas. Il faut une phrase, et elle doit tenir sur une ligne.
 *
 * Module pur : c'est la formulation qui a des cas limites — un membre qu'on ne
 * connaît pas encore, une soirée qui vient d'arriver et dont on n'a pas le
 * titre — pas l'affichage.
 */

export interface AttendanceNotice {
  /** `eventId:userId` — deux allers-retours sur le même bouton n'empilent rien. */
  id: string;
  eventId: string;
  userId: string;
  /** `true` s'il arrive, `false` s'il se décommande. */
  arriving: boolean;
}

/** Au-delà, l'écran se transforme en journal ; on garde les plus récentes. */
export const MAX_NOTICES = 3;

/**
 * La phrase affichée.
 *
 * Un nom manquant vaut mieux qu'un blanc ou qu'un identifiant : le club compte
 * sept personnes, « un membre » se devine. Un titre manquant aussi — la soirée
 * vient peut-être d'être créée dans la même seconde.
 */
export function noticeText(
  notice: Pick<AttendanceNotice, 'arriving'>,
  memberName: string | null | undefined,
  eventTitle: string | null | undefined,
): string {
  const who = memberName?.trim() || 'Un membre';
  const what = eventTitle?.trim() || 'une soirée';
  return notice.arriving ? `${who} vient à ${what}` : `${who} ne vient plus à ${what}`;
}

/**
 * Empile une nouvelle annonce, sans doublon.
 *
 * Quelqu'un qui hésite — « Je viens », puis non, puis si — ne doit pas laisser
 * trois lignes derrière lui : la dernière remplace la précédente, et remonte
 * en tête pour qu'on la relise.
 */
export function pushNotice(
  current: readonly AttendanceNotice[],
  notice: AttendanceNotice,
  max: number = MAX_NOTICES,
): AttendanceNotice[] {
  const without = current.filter((existing) => existing.id !== notice.id);
  return [notice, ...without].slice(0, max);
}
