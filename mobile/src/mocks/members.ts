import type { Member } from '@/types/domain';

/**
 * Membres du club — DONNEES_FICTIVES §Membres.
 * Les identifiants sont des UUID stables : le seed Supabase reprend les mêmes,
 * ce qui permet de basculer mock ↔ serveur sans changer une seule vue.
 */
export const MEMBERS: Record<string, Member> = {
  john: { id: '11111111-1111-4111-8111-000000000001', displayName: 'John', initials: 'JD', color: '#E8903D' },
  alex: { id: '11111111-1111-4111-8111-000000000002', displayName: 'Alex', initials: 'AX', color: '#6E9A78' },
  marco: { id: '11111111-1111-4111-8111-000000000003', displayName: 'Marco', initials: 'MC', color: '#8C7BA8' },
  sofia: { id: '11111111-1111-4111-8111-000000000004', displayName: 'Sofia', initials: 'SF', color: '#B3574F' },
  rayan: { id: '11111111-1111-4111-8111-000000000005', displayName: 'Rayan', initials: 'RY', color: '#5B8A9A' },
  lea: { id: '11111111-1111-4111-8111-000000000006', displayName: 'Léa', initials: 'LE', color: '#C9A227' },
  me: { id: '11111111-1111-4111-8111-000000000007', displayName: 'Toi', initials: 'TU', color: '#F2EBDD' },
};

export const MEMBER_LIST: Member[] = Object.values(MEMBERS);

/** Le club compte 7 membres : tous les compteurs sont sur 7. */
export const CLUB_SIZE = MEMBER_LIST.length;

/** Utilisateur courant tant qu'aucune session Supabase n'est ouverte. */
export const MOCK_CURRENT_USER_ID = MEMBERS.me!.id;

const BY_ID = new Map(MEMBER_LIST.map((m) => [m.id, m]));

export function memberById(id: string | null | undefined): Member | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}
