import type { CategoryId } from './types';
import type { IconName } from '../ui/icons/names';

export interface Category { id: CategoryId; title: string; icon: IconName; order: number }

export const CATEGORIES: readonly Category[] = [
  { id: 'wetter', title: 'Wetter', icon: 'cloud', order: 1 },
  { id: 'gefahren', title: 'Gefahren', icon: 'warning', order: 2 },
  { id: 'verkehr', title: 'Verkehr', icon: 'plane', order: 3 },
  { id: 'infrastruktur', title: 'Infrastruktur', icon: 'power', order: 4 },
  { id: 'erde', title: 'Erde', icon: 'globe', order: 5 },
  { id: 'meer', title: 'Meer', icon: 'wave', order: 6 },
  { id: 'medien', title: 'Medien', icon: 'camera', order: 7 },
  { id: 'gesellschaft', title: 'Gesellschaft', icon: 'people', order: 8 },
];

export const categoryById = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id)!;
