// US Cities data utilities
// Data source: https://simplemaps.com/data/us-cities

export interface City {
  city: string;
  state_id: string;
  state_name: string;
  population: number;
}

export interface State {
  id: string;
  name: string;
}

let citiesCache: City[] | null = null;

export async function loadCities(): Promise<City[]> {
  if (citiesCache) {
    return citiesCache;
  }

  const response = await fetch('/uscities.csv');
  const text = await response.text();
  
  // Parse CSV
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  
  const cityIndex = headers.indexOf('city_ascii');
  const stateIdIndex = headers.indexOf('state_id');
  const stateNameIndex = headers.indexOf('state_name');
  const populationIndex = headers.indexOf('population');
  
  const cities: City[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const population = parseInt(values[populationIndex], 10);
    
    // Only include cities with population data
    if (isNaN(population)) continue;
    
    cities.push({
      city: values[cityIndex],
      state_id: values[stateIdIndex],
      state_name: values[stateNameIndex],
      population,
    });
  }
  
  // Sort by population descending
  cities.sort((a, b) => b.population - a.population);
  
  citiesCache = cities;
  return cities;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export function getStates(cities: City[]): State[] {
  const stateMap = new Map<string, string>();
  
  for (const city of cities) {
    if (!stateMap.has(city.state_id)) {
      stateMap.set(city.state_id, city.state_name);
    }
  }
  
  return Array.from(stateMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCitiesByState(
  cities: City[],
  stateIds: string[],
  limit: number
): City[] {
  // -1 means no limit (return all cities in selected states)
  if (limit < 0) {
    return cities.filter(c => stateIds.includes(c.state_id));
  }
  
  // Apply limit PER STATE, not globally
  // Group cities by state, take top N from each, then combine
  const citiesByState = new Map<string, City[]>();
  
  for (const city of cities) {
    if (!stateIds.includes(city.state_id)) continue;
    
    const stateCities = citiesByState.get(city.state_id) || [];
    // Only add if we haven't hit the limit for this state
    if (stateCities.length < limit) {
      stateCities.push(city);
      citiesByState.set(city.state_id, stateCities);
    }
  }
  
  // Combine all cities and sort by population
  const result: City[] = [];
  for (const stateCities of citiesByState.values()) {
    result.push(...stateCities);
  }
  
  // Sort by population descending
  result.sort((a, b) => b.population - a.population);
  
  return result;
}

export function generateSearchQueries(
  cities: City[],
  businessType: string
): string[] {
  return cities.map(city => 
    `${businessType} in ${city.city} ${city.state_id}`
  );
}
