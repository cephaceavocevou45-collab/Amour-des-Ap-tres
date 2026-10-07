export const TIME_ZONE = 'Africa/Porto-Novo';
export const ATTENDANCE_GRACE_MINUTES = 60;
export const BIBLE_BOOKS = [
  'Genèse','Exode','Lévitique','Nombres','Deutéronome','Josué','Juges','Ruth','1 Samuel','2 Samuel','1 Rois','2 Rois','1 Chroniques','2 Chroniques','Esdras','Néhémie','Esther','Job','Psaumes','Proverbes','Ecclésiaste','Cantique des cantiques','Ésaïe','Jérémie','Lamentations','Ézéchiel','Daniel','Osée','Joël','Amos','Abdias','Jonas','Michée','Nahum','Habacuc','Sophonie','Aggée','Zacharie','Malachie','Matthieu','Marc','Luc','Jean','Actes','Romains','1 Corinthiens','2 Corinthiens','Galates','Éphésiens','Philippiens','Colossiens','1 Thessaloniciens','2 Thessaloniciens','1 Timothée','2 Timothée','Tite','Philémon','Hébreux','Jacques','1 Pierre','2 Pierre','1 Jean','2 Jean','3 Jean','Jude','Apocalypse'
] as const;
export type Sex = 'M' | 'F';
export type AttendanceType = 'COURS_BIBLIQUE' | 'GROUPE_SEMAINE';
export type AttendanceZone = 'FIDELES' | 'TEMPLE' | 'SALLE_VISION';
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ');
}
export function totals(entries: ReadonlyArray<{sex: Sex; zone: AttendanceZone}>) {
  const byZone = Object.fromEntries((['FIDELES','TEMPLE','SALLE_VISION'] as const).map(zone => {
    const men = entries.filter(e => e.zone === zone && e.sex === 'M').length;
    const women = entries.filter(e => e.zone === zone && e.sex === 'F').length;
    return [zone, {men, women, total: men + women}];
  }));
  const men = entries.filter(e => e.sex === 'M').length;
  const women = entries.filter(e => e.sex === 'F').length;
  return {byZone, men, women, total: men + women};
}
