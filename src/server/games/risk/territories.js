/**
 * Classic Risk board definition (42 territories).
 *
 * Coordinates are approximate world-map placements on the X/Z plane.
 */

export const CONTINENTS = {
  north_america: 'North America',
  south_america: 'South America',
  europe: 'Europe',
  africa: 'Africa',
  asia: 'Asia',
  australia: 'Australia',
};

export const CONTINENT_BONUSES = {
  north_america: 5,
  south_america: 2,
  europe: 5,
  africa: 3,
  asia: 7,
  australia: 2,
};

export const TERRITORIES = {
  // North America (9)
  alaska: {
    id: 'alaska',
    name: 'Alaska',
    continent: 'north_america',
    position: [-40, 20],
    adjacent: ['northwest_territory', 'alberta', 'kamchatka'],
  },
  northwest_territory: {
    id: 'northwest_territory',
    name: 'Northwest Territory',
    continent: 'north_america',
    position: [-32, 20],
    adjacent: ['alaska', 'alberta', 'ontario', 'greenland'],
  },
  greenland: {
    id: 'greenland',
    name: 'Greenland',
    continent: 'north_america',
    position: [-20, 22],
    adjacent: ['northwest_territory', 'ontario', 'quebec', 'iceland'],
  },
  alberta: {
    id: 'alberta',
    name: 'Alberta',
    continent: 'north_america',
    position: [-34, 15],
    adjacent: ['alaska', 'northwest_territory', 'ontario', 'western_united_states'],
  },
  ontario: {
    id: 'ontario',
    name: 'Ontario',
    continent: 'north_america',
    position: [-28, 15],
    adjacent: [
      'northwest_territory',
      'alberta',
      'western_united_states',
      'eastern_united_states',
      'quebec',
      'greenland',
    ],
  },
  quebec: {
    id: 'quebec',
    name: 'Quebec',
    continent: 'north_america',
    position: [-22, 15],
    adjacent: ['ontario', 'eastern_united_states', 'greenland'],
  },
  western_united_states: {
    id: 'western_united_states',
    name: 'Western United States',
    continent: 'north_america',
    position: [-31, 10],
    adjacent: ['alberta', 'ontario', 'eastern_united_states', 'central_america'],
  },
  eastern_united_states: {
    id: 'eastern_united_states',
    name: 'Eastern United States',
    continent: 'north_america',
    position: [-24, 10],
    adjacent: ['ontario', 'quebec', 'western_united_states', 'central_america'],
  },
  central_america: {
    id: 'central_america',
    name: 'Central America',
    continent: 'north_america',
    position: [-24, 4],
    adjacent: ['western_united_states', 'eastern_united_states', 'venezuela'],
  },

  // South America (4)
  venezuela: {
    id: 'venezuela',
    name: 'Venezuela',
    continent: 'south_america',
    position: [-20, -2],
    adjacent: ['central_america', 'peru', 'brazil'],
  },
  peru: {
    id: 'peru',
    name: 'Peru',
    continent: 'south_america',
    position: [-18, -8],
    adjacent: ['venezuela', 'brazil', 'argentina'],
  },
  brazil: {
    id: 'brazil',
    name: 'Brazil',
    continent: 'south_america',
    position: [-12, -8],
    adjacent: ['venezuela', 'peru', 'argentina', 'north_africa'],
  },
  argentina: {
    id: 'argentina',
    name: 'Argentina',
    continent: 'south_america',
    position: [-16, -15],
    adjacent: ['peru', 'brazil'],
  },

  // Europe (7)
  iceland: {
    id: 'iceland',
    name: 'Iceland',
    continent: 'europe',
    position: [-8, 20],
    adjacent: ['greenland', 'great_britain', 'scandinavia'],
  },
  great_britain: {
    id: 'great_britain',
    name: 'Great Britain',
    continent: 'europe',
    position: [-3, 16],
    adjacent: ['iceland', 'scandinavia', 'northern_europe', 'western_europe'],
  },
  scandinavia: {
    id: 'scandinavia',
    name: 'Scandinavia',
    continent: 'europe',
    position: [4, 18],
    adjacent: ['iceland', 'great_britain', 'northern_europe', 'ukraine'],
  },
  northern_europe: {
    id: 'northern_europe',
    name: 'Northern Europe',
    continent: 'europe',
    position: [4, 14],
    adjacent: ['great_britain', 'scandinavia', 'ukraine', 'southern_europe', 'western_europe'],
  },
  western_europe: {
    id: 'western_europe',
    name: 'Western Europe',
    continent: 'europe',
    position: [-2, 11],
    adjacent: ['great_britain', 'northern_europe', 'southern_europe', 'north_africa'],
  },
  southern_europe: {
    id: 'southern_europe',
    name: 'Southern Europe',
    continent: 'europe',
    position: [6, 10],
    adjacent: ['western_europe', 'northern_europe', 'ukraine', 'middle_east', 'egypt', 'north_africa'],
  },
  ukraine: {
    id: 'ukraine',
    name: 'Ukraine',
    continent: 'europe',
    position: [12, 15],
    adjacent: ['scandinavia', 'northern_europe', 'southern_europe', 'middle_east', 'afghanistan', 'ural'],
  },

  // Africa (6)
  north_africa: {
    id: 'north_africa',
    name: 'North Africa',
    continent: 'africa',
    position: [4, 3],
    adjacent: ['brazil', 'western_europe', 'southern_europe', 'egypt', 'east_africa', 'congo'],
  },
  egypt: {
    id: 'egypt',
    name: 'Egypt',
    continent: 'africa',
    position: [10, 5],
    adjacent: ['north_africa', 'southern_europe', 'middle_east', 'east_africa'],
  },
  east_africa: {
    id: 'east_africa',
    name: 'East Africa',
    continent: 'africa',
    position: [12, -2],
    adjacent: ['egypt', 'north_africa', 'congo', 'south_africa', 'madagascar', 'middle_east'],
  },
  congo: {
    id: 'congo',
    name: 'Congo',
    continent: 'africa',
    position: [6, -6],
    adjacent: ['north_africa', 'east_africa', 'south_africa'],
  },
  south_africa: {
    id: 'south_africa',
    name: 'South Africa',
    continent: 'africa',
    position: [8, -14],
    adjacent: ['congo', 'east_africa', 'madagascar'],
  },
  madagascar: {
    id: 'madagascar',
    name: 'Madagascar',
    continent: 'africa',
    position: [14, -12],
    adjacent: ['east_africa', 'south_africa'],
  },

  // Asia (12)
  ural: {
    id: 'ural',
    name: 'Ural',
    continent: 'asia',
    position: [18, 16],
    adjacent: ['ukraine', 'siberia', 'china', 'afghanistan'],
  },
  siberia: {
    id: 'siberia',
    name: 'Siberia',
    continent: 'asia',
    position: [24, 19],
    adjacent: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  },
  yakutsk: {
    id: 'yakutsk',
    name: 'Yakutsk',
    continent: 'asia',
    position: [30, 22],
    adjacent: ['siberia', 'irkutsk', 'kamchatka'],
  },
  kamchatka: {
    id: 'kamchatka',
    name: 'Kamchatka',
    continent: 'asia',
    position: [38, 21],
    adjacent: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'],
  },
  irkutsk: {
    id: 'irkutsk',
    name: 'Irkutsk',
    continent: 'asia',
    position: [30, 17],
    adjacent: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
  },
  mongolia: {
    id: 'mongolia',
    name: 'Mongolia',
    continent: 'asia',
    position: [32, 14],
    adjacent: ['siberia', 'irkutsk', 'kamchatka', 'japan', 'china'],
  },
  japan: {
    id: 'japan',
    name: 'Japan',
    continent: 'asia',
    position: [38, 14],
    adjacent: ['kamchatka', 'mongolia'],
  },
  afghanistan: {
    id: 'afghanistan',
    name: 'Afghanistan',
    continent: 'asia',
    position: [18, 11],
    adjacent: ['ukraine', 'ural', 'china', 'middle_east', 'india'],
  },
  middle_east: {
    id: 'middle_east',
    name: 'Middle East',
    continent: 'asia',
    position: [14, 7],
    adjacent: ['southern_europe', 'ukraine', 'afghanistan', 'india', 'east_africa', 'egypt'],
  },
  india: {
    id: 'india',
    name: 'India',
    continent: 'asia',
    position: [22, 7],
    adjacent: ['middle_east', 'afghanistan', 'china', 'siam'],
  },
  china: {
    id: 'china',
    name: 'China',
    continent: 'asia',
    position: [26, 12],
    adjacent: ['ural', 'siberia', 'mongolia', 'siam', 'india', 'afghanistan'],
  },
  siam: {
    id: 'siam',
    name: 'Siam',
    continent: 'asia',
    position: [27, 5],
    adjacent: ['india', 'china', 'indonesia'],
  },

  // Australia (4)
  indonesia: {
    id: 'indonesia',
    name: 'Indonesia',
    continent: 'australia',
    position: [32, -4],
    adjacent: ['siam', 'new_guinea', 'western_australia'],
  },
  new_guinea: {
    id: 'new_guinea',
    name: 'New Guinea',
    continent: 'australia',
    position: [39, -6],
    adjacent: ['indonesia', 'western_australia', 'eastern_australia'],
  },
  western_australia: {
    id: 'western_australia',
    name: 'Western Australia',
    continent: 'australia',
    position: [35, -13],
    adjacent: ['indonesia', 'new_guinea', 'eastern_australia'],
  },
  eastern_australia: {
    id: 'eastern_australia',
    name: 'Eastern Australia',
    continent: 'australia',
    position: [41, -14],
    adjacent: ['new_guinea', 'western_australia'],
  },
};

export const TERRITORY_IDS = Object.keys(TERRITORIES);

export const CONTINENT_TERRITORIES = Object.keys(CONTINENTS).reduce((acc, continentId) => {
  acc[continentId] = TERRITORY_IDS.filter((territoryId) => TERRITORIES[territoryId].continent === continentId);
  return acc;
}, {});

export function validateTerritoryGraph() {
  const errors = [];
  const ids = new Set(TERRITORY_IDS);

  for (const territoryId of TERRITORY_IDS) {
    const territory = TERRITORIES[territoryId];

    if (!CONTINENTS[territory.continent]) {
      errors.push(`Territory "${territoryId}" references unknown continent "${territory.continent}"`);
    }

    for (const adjacentId of territory.adjacent) {
      if (!ids.has(adjacentId)) {
        errors.push(`Territory "${territoryId}" references unknown adjacent territory "${adjacentId}"`);
        continue;
      }

      const reverseAdjacency = TERRITORIES[adjacentId].adjacent;
      if (!reverseAdjacency.includes(territoryId)) {
        errors.push(`Adjacency mismatch: "${territoryId}" -> "${adjacentId}" is not bidirectional`);
      }
    }
  }

  for (const [continentId, members] of Object.entries(CONTINENT_TERRITORIES)) {
    if (members.length === 0) {
      errors.push(`Continent "${continentId}" has no territories`);
    }
  }

  if (TERRITORY_IDS.length !== 42) {
    errors.push(`Expected 42 territories, found ${TERRITORY_IDS.length}`);
  }

  return errors;
}

const GRAPH_ERRORS = validateTerritoryGraph();
if (GRAPH_ERRORS.length > 0) {
  throw new Error(`[Risk] Invalid territory graph:\n${GRAPH_ERRORS.join('\n')}`);
}
