export type PropertyCategory = 'residential' | 'commercial' | 'mixed';
export type PropertyStructure = 'single_unit' | 'multi_unit';

export interface PropertyTypeOption {
  label: string;
  category: PropertyCategory;
  defaultStructure: PropertyStructure;
  description: string;
}

export const PROPERTY_TYPE_OPTIONS: PropertyTypeOption[] = [
  // Residential Multi-Unit
  {
    label: 'Residential Apartment Complex',
    category: 'residential',
    defaultStructure: 'multi_unit',
    description: 'Multi-story apartment building or complex with individual leasable flats',
  },
  {
    label: 'Gated Villa Community',
    category: 'residential',
    defaultStructure: 'multi_unit',
    description: 'Enclosed community composed of individual villas, row houses, or cottages',
  },
  {
    label: 'Independent Multi-Unit House',
    category: 'residential',
    defaultStructure: 'multi_unit',
    description: 'Multi-floor independent building with separate units or floors for tenants',
  },
  {
    label: 'Co-Living / PG / Student Housing',
    category: 'residential',
    defaultStructure: 'multi_unit',
    description: 'Shared residential facility with private/shared rooms and common facilities',
  },

  // Residential Single-Unit (Whole House / Single Villa)
  {
    label: 'Single-Family House / Villa',
    category: 'residential',
    defaultStructure: 'single_unit',
    description: 'Entire independent villa, bungalow, or residential house leased as a single unit',
  },
  {
    label: '4 BHK / Luxury Villa',
    category: 'residential',
    defaultStructure: 'single_unit',
    description: 'High-end spacious villa or 4+ BHK house leased as a single standalone property',
  },

  // Commercial
  {
    label: 'Commercial Plaza / Office Complex',
    category: 'commercial',
    defaultStructure: 'multi_unit',
    description: 'Office tower, corporate center, or plaza divided into multiple office suites',
  },
  {
    label: 'Standalone Commercial Building',
    category: 'commercial',
    defaultStructure: 'single_unit',
    description: 'Entire commercial facility or headquarters leased to a single corporate tenant',
  },
  {
    label: 'Retail Shop / Showroom',
    category: 'commercial',
    defaultStructure: 'single_unit',
    description: 'Standalone retail showroom, street-level shop, or boutique leased as a single unit',
  },
  {
    label: 'Industrial / Warehouse',
    category: 'commercial',
    defaultStructure: 'single_unit',
    description: 'Industrial shed, logistics warehouse, or storage depot leased as a single facility',
  },

  // Mixed
  {
    label: 'Mixed-Use (Residential + Commercial)',
    category: 'mixed',
    defaultStructure: 'multi_unit',
    description: 'Building combining retail/commercial spaces on lower floors with residential apartments above',
  },
];

export const RESIDENTIAL_UNIT_TYPES = [
  '1 RK',
  'Studio',
  '1 BHK',
  '2 BHK',
  '3 BHK',
  '4 BHK',
  '4+ BHK',
  'Penthouse',
  'Duplex',
  'Villa / House',
] as const;

export const COMMERCIAL_UNIT_TYPES = [
  'Commercial Office',
  'Shop / Retail',
  'Showroom',
  'Warehouse / Storage',
  'Commercial Floor',
  'Co-Working Desk / Cabin',
] as const;

/**
 * Categorize a property type string into 'residential', 'commercial', or 'mixed'.
 */
export function getPropertyCategory(propertyType?: string): PropertyCategory {
  if (!propertyType) return 'residential';
  const clean = propertyType.toLowerCase();
  if (clean.includes('mixed')) return 'mixed';
  if (
    clean.includes('commercial') ||
    clean.includes('office') ||
    clean.includes('retail') ||
    clean.includes('shop') ||
    clean.includes('showroom') ||
    clean.includes('warehouse') ||
    clean.includes('industrial')
  ) {
    return 'commercial';
  }
  return 'residential';
}

/**
 * Determine default property structure ('single_unit' or 'multi_unit')
 */
export function getDefaultPropertyStructure(propertyType?: string): PropertyStructure {
  if (!propertyType) return 'multi_unit';
  const match = PROPERTY_TYPE_OPTIONS.find(
    (opt) => opt.label.toLowerCase() === propertyType.toLowerCase()
  );
  if (match) return match.defaultStructure;

  const clean = propertyType.toLowerCase();
  if (
    clean.includes('single') ||
    clean.includes('standalone') ||
    (clean.includes('villa') && !clean.includes('community')) ||
    clean.includes('bungalow') ||
    (clean.includes('house') && !clean.includes('multi'))
  ) {
    return 'single_unit';
  }
  return 'multi_unit';
}

/**
 * Determine if a property is a single unit property based on structure, type, or unit count
 */
export function isSingleUnitProperty(prop?: {
  propertyStructure?: PropertyStructure | string;
  propertyType?: string;
  unitCount?: number;
}): boolean {
  if (!prop) return false;
  if (prop.propertyStructure === 'single_unit') return true;
  if (prop.propertyStructure === 'multi_unit') return false;

  // Fallback to propertyType heuristics
  if (prop.propertyType) {
    const struct = getDefaultPropertyStructure(prop.propertyType);
    if (struct === 'single_unit' && (!prop.unitCount || prop.unitCount <= 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns permissible unit types based on property type / category.
 * If currentUnitType is provided and not in the standard list, it is preserved.
 */
export function getUnitTypesForProperty(
  propertyType?: string,
  currentUnitType?: string
): string[] {
  const category = getPropertyCategory(propertyType);
  let baseTypes: string[];

  if (category === 'commercial') {
    baseTypes = [...COMMERCIAL_UNIT_TYPES];
  } else if (category === 'residential') {
    baseTypes = [...RESIDENTIAL_UNIT_TYPES];
  } else {
    // Mixed
    baseTypes = Array.from(new Set([...RESIDENTIAL_UNIT_TYPES, ...COMMERCIAL_UNIT_TYPES]));
  }

  // Ensure current unit type is preserved if it already exists in data
  if (currentUnitType && !baseTypes.includes(currentUnitType as any)) {
    return [currentUnitType, ...baseTypes];
  }

  return baseTypes;
}

