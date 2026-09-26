import type { ClubEvent, PotluckItem } from '@/types/domain';
import { MEMBERS } from './members';

/** Événements — DONNEES_FICTIVES §Événements. */
export const MOCK_EVENTS: ClubEvent[] = [
  {
    id: '22222222-2222-4222-8222-000000000001',
    startsAt: '2026-09-18T20:00:00+11:00',
    title: 'Pastaga & Wine Tasting',
    location: 'Penthouse — Marco',
    themes: ['Crypto Night'],
    createdBy: MEMBERS.marco!.id,
    editedAt: null,
  },
  {
    id: '22222222-2222-4222-8222-000000000002',
    startsAt: '2026-10-03T19:30:00+11:00',
    title: 'Grillades & Halving Talk',
    location: 'Rooftop — Alex',
    themes: ['Crypto Night', 'Stock Night'],
    // Proposée par le membre de démo : c'est elle qu'il peut modifier.
    createdBy: MEMBERS.me!.id,
    editedAt: null,
  },
  {
    id: '22222222-2222-4222-8222-000000000003',
    startsAt: '2026-10-22T22:00:00+11:00',
    title: 'Night Trading Session',
    location: 'Loft — Sofia',
    themes: ['Stock Night', 'Vibe Coding Night'],
    createdBy: MEMBERS.sofia!.id,
    editedAt: '2026-09-20T09:12:00+11:00',
  },
];

/** Présences initiales, par identifiant d'événement. */
export const MOCK_ATTENDANCE: Record<string, string[]> = {
  [MOCK_EVENTS[0]!.id]: [
    MEMBERS.john!.id, MEMBERS.alex!.id, MEMBERS.marco!.id, MEMBERS.sofia!.id, MEMBERS.lea!.id,
  ],
  [MOCK_EVENTS[1]!.id]: [MEMBERS.alex!.id, MEMBERS.rayan!.id, MEMBERS.lea!.id],
  [MOCK_EVENTS[2]!.id]: [
    MEMBERS.sofia!.id, MEMBERS.john!.id, MEMBERS.marco!.id, MEMBERS.rayan!.id, MEMBERS.alex!.id,
  ],
};

/** « Viens pas » de démo : Marco et Sofia ne viendront pas aux Grillades. */
export const MOCK_DECLINES: Record<string, string[]> = {
  [MOCK_EVENTS[1]!.id]: [MEMBERS.marco!.id, MEMBERS.sofia!.id],
};

let sequence = 0;
function item(eventId: string, itemName: string, assignedUserId: string | null): PotluckItem {
  sequence += 1;
  return {
    id: `33333333-3333-4333-8333-${String(sequence).padStart(12, '0')}`,
    eventId,
    itemName,
    assignedUserId,
    position: sequence,
  };
}

/** Listes potluck — DONNEES_FICTIVES §Événements. */
export const MOCK_POTLUCK_ITEMS: PotluckItem[] = [
  item(MOCK_EVENTS[0]!.id, 'Viande (2 kg)', MEMBERS.john!.id),
  item(MOCK_EVENTS[0]!.id, 'Glaçons', null),
  item(MOCK_EVENTS[0]!.id, 'Vins — 3 bouteilles', MEMBERS.alex!.id),
  item(MOCK_EVENTS[0]!.id, 'Pastaga & olives', MEMBERS.marco!.id),
  item(MOCK_EVENTS[0]!.id, 'Fromages', null),
  item(MOCK_EVENTS[0]!.id, 'Dessert', MEMBERS.sofia!.id),

  item(MOCK_EVENTS[1]!.id, 'Charbon', MEMBERS.rayan!.id),
  item(MOCK_EVENTS[1]!.id, 'Viande', null),
  item(MOCK_EVENTS[1]!.id, 'Bières', null),
  item(MOCK_EVENTS[1]!.id, 'Salades', MEMBERS.lea!.id),

  item(MOCK_EVENTS[2]!.id, 'Sushis', MEMBERS.sofia!.id),
  item(MOCK_EVENTS[2]!.id, 'Whisky', null),
  item(MOCK_EVENTS[2]!.id, 'Café (litres)', MEMBERS.john!.id),
];
