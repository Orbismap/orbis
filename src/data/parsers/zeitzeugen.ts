// Shared by the "Zeitzeugen" layers (Ukraine, Gaza, Kriegsarchiv): content warning and small helpers.
export const ZEUGEN_WARNUNG = {
  title: 'Inhaltswarnung',
  text:
    'Diese Ebene zeigt Kriegsdokumentation aus Gaza, dem Westjordanland und der Ukraine: Material über Gewalt, Tote und Verletzte, gesammelt zur Dokumentation und juristischen Aufarbeitung. '
    + 'Auf der Karte selbst erscheinen nur Positionen, Zahlen und Text; verlinktes Belegmaterial kann verstörende Aufnahmen enthalten. Diskretion empfohlen.',
};

/** Host name of a URL as link label ("facebook.com"). */
export const hostLabel = (u: string): string => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u.slice(0, 40); }
};
export const isHttp = (u: string): boolean => /^https?:\/\//i.test(u);
