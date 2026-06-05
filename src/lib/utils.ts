export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const avClass = (seed: string) =>
  'av-c' + (Math.abs([...seed].reduce((a, c) => a + c.charCodeAt(0), 0)) % 8);
