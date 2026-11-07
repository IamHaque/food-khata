import { type FilterState, validateFilters } from './filters';

export type CrossFilterDimension =
  | 'platform'
  | 'restaurant'
  | 'cuisine'
  | 'month'
  | 'weekday'
  | 'hour'
  | 'meal_slot';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late_night';

export interface DeclarativeMapping {
  dimension: CrossFilterDimension;
  targetFields: (keyof FilterState)[];
  toPatch: (value: string) => Partial<FilterState>;
}

export function parseMealSlot(value: string): MealSlot {
  const norm = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (norm === 'breakfast' || norm === 'lunch' || norm === 'snack' || norm === 'dinner' || norm === 'late_night') {
    return norm;
  }
  throw new Error(`Invalid meal slot: ${value}`);
}

export function hourToMealSlot(value: string | number): MealSlot {
  let hour: number;
  if (typeof value === 'number') {
    hour = value;
  } else {
    const str = String(value).trim().toLowerCase();
    const ampm = str.match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)$/);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const meridiem = ampm[2];
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      hour = h;
    } else {
      const numMatch = str.match(/^(\d{1,2})/);
      if (numMatch) {
        hour = parseInt(numMatch[1], 10);
      } else {
        throw new Error(`Invalid hour value: ${value}`);
      }
    }
  }
  hour = ((hour % 24) + 24) % 24;
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'late_night';
}

export function weekdayToDayType(value: string): 'weekday' | 'weekend' {
  const s = value.trim().toLowerCase();
  if (s === 'weekend') return 'weekend';
  if (s === 'weekday') return 'weekday';
  if (['sat', 'saturday', 'sun', 'sunday', '6', '0'].includes(s)) {
    return 'weekend';
  }
  return 'weekday';
}

export function monthToDateRange(value: string): { date_from: string; date_to: string } {
  const str = value.trim();
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})/);
  let year: number;
  let month: number;
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
  } else {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
      month = parsed.getMonth() + 1;
    } else {
      throw new Error(`Invalid month value: ${value}`);
    }
  }
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month value: ${value}`);
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { date_from: start, date_to: end };
}

export const DECLARATIVE_MAPPINGS: Record<CrossFilterDimension, DeclarativeMapping> = {
  platform: {
    dimension: 'platform',
    targetFields: ['platforms'],
    toPatch: (val: string) => ({ platforms: [val] }),
  },
  restaurant: {
    dimension: 'restaurant',
    targetFields: ['restaurant_ids'],
    toPatch: (val: string) => ({ restaurant_ids: [val] }),
  },
  cuisine: {
    dimension: 'cuisine',
    targetFields: ['cuisines'],
    toPatch: (val: string) => ({ cuisines: [val] }),
  },
  meal_slot: {
    dimension: 'meal_slot',
    targetFields: ['meal_slots'],
    toPatch: (val: string) => ({ meal_slots: [parseMealSlot(val)] }),
  },
  hour: {
    dimension: 'hour',
    targetFields: ['meal_slots'],
    toPatch: (val: string) => ({ meal_slots: [hourToMealSlot(val)] }),
  },
  weekday: {
    dimension: 'weekday',
    targetFields: ['day_type'],
    toPatch: (val: string) => ({ day_type: weekdayToDayType(val) }),
  },
  month: {
    dimension: 'month',
    targetFields: ['date_from', 'date_to'],
    toPatch: (val: string) => monthToDateRange(val),
  },
};

export function mapElementToPatch(dimension: CrossFilterDimension, value: string): Partial<FilterState> {
  const mapping = DECLARATIVE_MAPPINGS[dimension];
  if (!mapping) {
    throw new Error(`Unknown cross-filter dimension: ${dimension}`);
  }
  return mapping.toPatch(value);
}

export function declareChartMapping(
  dimension: CrossFilterDimension,
  customResolver?: (value: string) => Partial<FilterState>
): (value: string) => Partial<FilterState> {
  return (value: string) => {
    if (customResolver) return customResolver(value);
    return DECLARATIVE_MAPPINGS[dimension].toPatch(value);
  };
}

export function crossFilter(
  currentFilters: FilterState,
  dimension: CrossFilterDimension,
  value: string,
  isMulti = false
): FilterState {
  const next: FilterState = {
    ...currentFilters,
    platforms: [...currentFilters.platforms],
    restaurant_ids: [...currentFilters.restaurant_ids],
    cuisines: [...currentFilters.cuisines],
    meal_slots: [...currentFilters.meal_slots],
  };

  switch (dimension) {
    case 'platform': {
      if (!isMulti) {
        if (currentFilters.platforms.length === 1 && currentFilters.platforms[0] === value) {
          next.platforms = [];
        } else {
          next.platforms = [value];
        }
      } else {
        if (currentFilters.platforms.includes(value)) {
          next.platforms = currentFilters.platforms.filter(x => x !== value);
        } else {
          next.platforms = [...currentFilters.platforms, value];
        }
      }
      break;
    }
    case 'restaurant': {
      if (!isMulti) {
        if (currentFilters.restaurant_ids.length === 1 && currentFilters.restaurant_ids[0] === value) {
          next.restaurant_ids = [];
        } else {
          next.restaurant_ids = [value];
        }
      } else {
        if (currentFilters.restaurant_ids.includes(value)) {
          next.restaurant_ids = currentFilters.restaurant_ids.filter(x => x !== value);
        } else {
          next.restaurant_ids = [...currentFilters.restaurant_ids, value];
        }
      }
      break;
    }
    case 'cuisine': {
      if (!isMulti) {
        if (currentFilters.cuisines.length === 1 && currentFilters.cuisines[0] === value) {
          next.cuisines = [];
        } else {
          next.cuisines = [value];
        }
      } else {
        if (currentFilters.cuisines.includes(value)) {
          next.cuisines = currentFilters.cuisines.filter(x => x !== value);
        } else {
          next.cuisines = [...currentFilters.cuisines, value];
        }
      }
      break;
    }
    case 'meal_slot': {
      const slot = parseMealSlot(value);
      if (!isMulti) {
        if (currentFilters.meal_slots.length === 1 && currentFilters.meal_slots[0] === slot) {
          next.meal_slots = [];
        } else {
          next.meal_slots = [slot];
        }
      } else {
        if (currentFilters.meal_slots.includes(slot)) {
          next.meal_slots = currentFilters.meal_slots.filter(x => x !== slot);
        } else {
          next.meal_slots = [...currentFilters.meal_slots, slot];
        }
      }
      break;
    }
    case 'hour': {
      const slot = hourToMealSlot(value);
      if (!isMulti) {
        if (currentFilters.meal_slots.length === 1 && currentFilters.meal_slots[0] === slot) {
          next.meal_slots = [];
        } else {
          next.meal_slots = [slot];
        }
      } else {
        if (currentFilters.meal_slots.includes(slot)) {
          next.meal_slots = currentFilters.meal_slots.filter(x => x !== slot);
        } else {
          next.meal_slots = [...currentFilters.meal_slots, slot];
        }
      }
      break;
    }
    case 'weekday': {
      const targetDayType = weekdayToDayType(value);
      if (!isMulti) {
        if (currentFilters.day_type === targetDayType) {
          next.day_type = 'all';
        } else {
          next.day_type = targetDayType;
        }
      } else {
        if (currentFilters.day_type === targetDayType) {
          next.day_type = 'all';
        } else if (currentFilters.day_type === 'all') {
          next.day_type = targetDayType;
        } else {
          next.day_type = 'all';
        }
      }
      break;
    }
    case 'month': {
      const { date_from, date_to } = monthToDateRange(value);
      if (!isMulti) {
        if (currentFilters.date_from === date_from && currentFilters.date_to === date_to) {
          next.date_from = null;
          next.date_to = null;
        } else {
          next.date_from = date_from;
          next.date_to = date_to;
        }
      } else {
        if (currentFilters.date_from === date_from && currentFilters.date_to === date_to) {
          next.date_from = null;
          next.date_to = null;
        } else if (currentFilters.date_from && currentFilters.date_to) {
          next.date_from = currentFilters.date_from < date_from ? currentFilters.date_from : date_from;
          next.date_to = currentFilters.date_to > date_to ? currentFilters.date_to : date_to;
        } else {
          next.date_from = date_from;
          next.date_to = date_to;
        }
      }
      break;
    }
    default: {
      const _exhaustive: never = dimension;
      throw new Error(`Unsupported cross-filter dimension: ${_exhaustive}`);
    }
  }

  return validateFilters(next);
}

export const applyCrossFilterToState = crossFilter;

let crossFilterHistoryStack: FilterState[] = [];

export function pushCrossFilterHistory(state: FilterState): void {
  crossFilterHistoryStack.push(JSON.parse(JSON.stringify(state)) as FilterState);
}

export function popCrossFilterHistory(): FilterState | undefined {
  return crossFilterHistoryStack.pop();
}

export function peekCrossFilterHistory(): FilterState | undefined {
  return crossFilterHistoryStack[crossFilterHistoryStack.length - 1];
}

export function clearCrossFilterHistory(): void {
  crossFilterHistoryStack = [];
}

export function getCrossFilterHistory(): FilterState[] {
  return [...crossFilterHistoryStack];
}

export function canUndoCrossFilter(): boolean {
  return crossFilterHistoryStack.length > 0;
}

export function crossFilterWithHistory(
  currentFilters: FilterState,
  dimension: CrossFilterDimension,
  value: string,
  isMulti = false
): FilterState {
  pushCrossFilterHistory(currentFilters);
  return crossFilter(currentFilters, dimension, value, isMulti);
}
