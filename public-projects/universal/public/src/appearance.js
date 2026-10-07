// Keep the light/dark mode compatible with existing components and saved spaces.
export const APPEARANCES = [
  { id: 'aurora', name: 'Aurora', description: 'Deep teal · mineral colors', palette: 'aurora', theme: 'dark' },
  { id: 'nocturne', name: 'Nocturne', description: 'Ink plum · violet accents', palette: 'nocturne', theme: 'dark' },
  { id: 'dark', name: 'After hours', description: 'The original navy', palette: 'classic', theme: 'dark' },
  { id: 'light', name: 'Daylight', description: 'The original light theme', palette: 'classic', theme: 'light' },
];
export function appearanceId(settings) {
  if (settings.theme === 'light') return 'light';
  return settings.palette === 'classic' ? 'dark' : settings.palette === 'nocturne' ? 'nocturne' : 'aurora';
}
export function appearanceSettings(id) {
  const item = APPEARANCES.find(item => item.id === id) || APPEARANCES[0];
  return { theme: item.theme, palette: item.palette };
}
export function nextDarkAppearance(settings) {
  const choices = ['aurora', 'nocturne', 'dark'];
  return choices[(choices.indexOf(appearanceId(settings)) + 1) % choices.length];
}
