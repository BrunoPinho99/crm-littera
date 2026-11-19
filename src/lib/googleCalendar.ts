export interface GoogleCalendarEventParams {
  title: string;
  description?: string;
  location?: string;
  startDateTime: string; // ISO 8601 string or Date
  durationMinutes?: number;
  attendeesEmails?: string[];
}

/**
 * Gera URL de template do Google Calendar Web (funciona em qualquer conta Google sem login de API prévio)
 */
export function buildGoogleCalendarUrl({
  title,
  description = '',
  location = 'Online / Google Meet',
  startDateTime,
  durationMinutes = 30,
  attendeesEmails = [],
}: GoogleCalendarEventParams): string {
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const formatGCalDate = (d: Date) =>
    d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const datesParam = `${formatGCalDate(start)}/${formatGCalDate(end)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: datesParam,
    details: description,
    location: location,
  });

  if (attendeesEmails.length > 0) {
    params.set('add', attendeesEmails.filter(Boolean).join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
