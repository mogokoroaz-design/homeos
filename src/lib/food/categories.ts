export const FOOD_CATEGORIES = [
  "vegetable", "fruit", "meat", "seafood", "dairy", "grain", "legume", "bakery", "spice", "oil", "sauce", "nut",
  "beverage", "sweet", "snack", "frozen", "other",
] as const;

// Keyword heuristics used when an ingredient has no reference link (documented, overridable per item).
const KEYWORDS: Array<[string, RegExp]> = [
  ["meat", /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|mince|steak|ham|veal|duck)\b/],
  ["seafood", /\b(salmon|tuna|shrimp|prawn|fish|cod|crab|mussel|scallop|sardine|tilapia)\b/],
  ["dairy", /\b(milk|cheese|yogurt|yoghurt|butter|cream|egg|eggs|paneer|ghee)\b/],
  ["vegetable", /\b(spinach|onion|garlic|tomato|potato|carrot|pepper|broccoli|mushroom|lettuce|cabbage|zucchini|cucumber|celery|kale|pea|peas|corn|eggplant|cauliflower|leek|ginger|chilli|chili|bean sprout|asparagus|squash|pumpkin|beet|radish|herb|cilantro|coriander|parsley|basil|scallion|shallot)\b/],
  ["fruit", /\b(apple|banana|lemon|lime|orange|berry|berries|grape|mango|pineapple|pear|peach|avocado|melon|cherry|kiwi|date)\b/],
  ["grain", /\b(rice|pasta|noodle|flour|oat|oats|quinoa|couscous|bread|tortilla|barley|cereal)\b/],
  ["legume", /\b(lentil|chickpea|bean|beans|tofu|tempeh|dal)\b/],
  ["spice", /\b(salt|pepper|cumin|paprika|turmeric|cinnamon|oregano|thyme|spice|masala|chilli powder|nutmeg|clove)\b/],
  ["oil", /\b(oil|vinegar)\b/],
  ["sauce", /\b(sauce|ketchup|mayo|mayonnaise|mustard|stock|broth|paste|soy)\b/],
  ["nut", /\b(almond|walnut|cashew|peanut|seed|seeds|pistachio)\b/],
];

export function guessCategory(name: string) {
  const n = name.toLowerCase();
  for (const [cat, re] of KEYWORDS) if (re.test(n)) return cat;
  return "other";
}
