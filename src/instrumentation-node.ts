// Server start (Node.js only): older ingredients were created without nutrition — link confident USDA matches.
import { autoLinkUnlinkedFoods } from "./lib/food/catalog";

autoLinkUnlinkedFoods()
  .then((r) => { if (r.linked) console.log(`HomeOS: matched nutrition for ${r.linked} ingredient(s) automatically`); })
  .catch((e) => console.warn("HomeOS: automatic nutrition matching skipped", e instanceof Error ? e.message : e));
