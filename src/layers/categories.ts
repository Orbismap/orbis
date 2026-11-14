import type { CategoryId } from './types';
import type { IconName } from '../ui/icons/names';

export interface Category { id: CategoryId; title: string; icon: IconName; order: number }

export const CATEGORIES: readonly Category[] = [
  { id: 'wetter', title: 'Wetter', icon: 'cloud', order: 1 },
  { id: 'gefahren', title: 'Gefahren', icon: 'warning', order: 2 },
  { id: 'verkehr', title: 'Verkehr', icon: 'plane', order: 3 },
  { id: 'infrastruktur', title: 'Infrastruktur', icon: 'power', order: 4 },
  { id: 'wasser', title: 'Wasser', icon: 'drop', order: 5 },
  { id: 'erde', title: 'Erde', icon: 'globe', order: 6 },
  { id: 'meer', title: 'Meer', icon: 'wave', order: 7 },
  { id: 'medien', title: 'Medien', icon: 'camera', order: 8 },
  { id: 'gesellschaft', title: 'Gesellschaft', icon: 'people', order: 9 },
];

export const categoryById = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id)!;
