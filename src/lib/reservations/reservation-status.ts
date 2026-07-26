import type { ReservationStatus } from './reservation-types';

export type ReservationStatusMeta = {
  label: string;
  tone: 'neutral' | 'pending' | 'confirmed' | 'live' | 'done' | 'problem';
  symbol: string;
};

export const RESERVATION_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'arrived',
  'waiting',
  'seated',
  'finished',
  'cancelled',
  'no_show'
];

export const RESERVATION_STATUS: Record<ReservationStatus, ReservationStatusMeta> = {
  pending: { label: 'Pending', tone: 'pending', symbol: '!' },
  confirmed: { label: 'Confirmed', tone: 'confirmed', symbol: '✓' },
  arrived: { label: 'Arrived', tone: 'live', symbol: '•' },
  waiting: { label: 'Waiting', tone: 'pending', symbol: '…' },
  seated: { label: 'Seated', tone: 'live', symbol: '●' },
  finished: { label: 'Finished', tone: 'done', symbol: '✓' },
  cancelled: { label: 'Cancelled', tone: 'neutral', symbol: '×' },
  no_show: { label: 'No-show', tone: 'problem', symbol: '!' }
};

export function reservationStatusMeta(status: ReservationStatus): ReservationStatusMeta {
  return RESERVATION_STATUS[status];
}


const RESERVATION_NEXT_STATUS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'arrived', 'waiting', 'seated', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'waiting', 'seated', 'cancelled', 'no_show'],
  arrived: ['waiting', 'seated', 'cancelled', 'no_show'],
  waiting: ['seated', 'cancelled', 'no_show'],
  seated: ['finished'],
  finished: [],
  cancelled: [],
  no_show: []
};

export function reservationNextStatuses(status: ReservationStatus): ReservationStatus[] {
  return [status, ...RESERVATION_NEXT_STATUS[status]];
}

export function reservationIsTerminal(status: ReservationStatus): boolean {
  return RESERVATION_NEXT_STATUS[status].length === 0;
}
