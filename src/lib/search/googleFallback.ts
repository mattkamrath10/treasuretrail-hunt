// Final fallback of the search waterfall. When neither TreasureTrail nor any
// enabled external marketplace returns results, the UI offers these outbound
// Google links. Outbound links use <a target="_blank" rel="noopener
// noreferrer"> per ARCHITECTURE.md §6.

export function googleSearchUrl(term: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${term} for sale`)}`;
}

export function googleShoppingUrl(term: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(term)}`;
}
