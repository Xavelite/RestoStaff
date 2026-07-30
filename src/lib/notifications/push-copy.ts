import type { NotificationItem } from './notification-model.ts';
import { serviceLabel } from '../calendar/date.ts';

type PushLocale = 'en' | 'fr' | 'nl';

type Params = Record<string, string | number>;

const COPY: Record<Exclude<PushLocale, 'en'>, Record<string, string>> = {
  fr: {
    '{name} requested absence': '{name} a demandé un congé',
    '{name} submitted availability': '{name} a envoyé ses disponibilités',
    '{name} is unavailable on a planned shift': '{name} est indisponible pour un service planifié',
    '{name} forgot to badge out': '{name} a oublié de pointer son départ',
    '{name} worked during approved absence': '{name} a travaillé pendant un congé approuvé',
    '{name} badged in late': '{name} a pointé en retard',
    '{name} did not show up': '{name} n’a pas pointé',
    '{name} accepted the invite': '{name} a accepté l’invitation',
    'Week of {week}': 'Semaine du {week}',
    'Your shifts are published': 'Vos services sont publiés',
    'Schedule published': 'Planning publié',
    'Week of {week} - see your shifts': 'Semaine du {week} - consultez vos services',
    "Week of {week} - you're not scheduled": 'Semaine du {week} - aucun service prévu',
    'Absence approved': 'Congé approuvé',
    'Absence refused': 'Congé refusé',
    'You forgot to badge out': 'Vous avez oublié de pointer votre départ',
    'Shift soon': 'Service bientôt',
    'Urgent message': 'Message urgent',
    'New message': 'Nouveau message',
    Day: 'Jour',
    Night: 'Nuit',
    Lunch: 'Midi',
    Evening: 'Soir'
  },
  nl: {
    '{name} requested absence': '{name} heeft verlof aangevraagd',
    '{name} submitted availability': '{name} heeft beschikbaarheid ingediend',
    '{name} is unavailable on a planned shift': '{name} is niet beschikbaar voor een geplande dienst',
    '{name} forgot to badge out': '{name} vergat uit te klokken',
    '{name} worked during approved absence': '{name} werkte tijdens goedgekeurd verlof',
    '{name} badged in late': '{name} klokte te laat in',
    '{name} did not show up': '{name} is niet komen opdagen',
    '{name} accepted the invite': '{name} heeft de uitnodiging aanvaard',
    'Week of {week}': 'Week van {week}',
    'Your shifts are published': 'Je diensten zijn gepubliceerd',
    'Schedule published': 'Planning gepubliceerd',
    'Week of {week} - see your shifts': 'Week van {week} - bekijk je diensten',
    "Week of {week} - you're not scheduled": 'Week van {week} - je bent niet ingepland',
    'Absence approved': 'Verlof goedgekeurd',
    'Absence refused': 'Verlof geweigerd',
    'You forgot to badge out': 'Je vergat uit te klokken',
    'Shift soon': 'Dienst binnenkort',
    'Urgent message': 'Dringend bericht',
    'New message': 'Nieuw bericht',
    Day: 'Dag',
    Night: 'Nacht',
    Lunch: 'Lunch',
    Evening: 'Avond'
  }
};

function normalizePushLocale(value: unknown): PushLocale {
  const language = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return language === 'fr' || language === 'nl' ? language : 'en';
}

function interpolate(message: string, params: Params = {}): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

function translate(locale: PushLocale, message: string, params: Params = {}): string {
  const template = locale === 'en' ? message : COPY[locale][message] ?? message;
  return interpolate(template, params);
}

export function notificationPushCopy(
  item: NotificationItem,
  localeValue: unknown
): { title: string; body: string } {
  const locale = normalizePushLocale(localeValue);
  const service = item.serviceKey
    ? translate(locale, serviceLabel(item.serviceKey))
    : undefined;
  return {
    title: translate(locale, item.title, item.titleParams),
    body: translate(locale, item.body, service ? { ...item.bodyParams, service } : item.bodyParams)
  };
}
