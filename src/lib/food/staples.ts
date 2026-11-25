/** Things that come out of the tap or freezer — never "missing" and never on the shopping list. */
export function isFreeStaple(name: string) {
  return /^\s*(?:(?:warm|cold|hot|lukewarm|boiling|tap|filtered|iced?|chilled|room[- ]temperature)\s+)*water\b(?!\s*(?:chestnut|melon|cress))|^\s*ice(?:\s+cubes?)?\s*$/i.test(name);
}
