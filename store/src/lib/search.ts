/**
 * Product search that understands how people in India type spice names:
 *
 * - Hindi and regional names, in English letters or Devanagari: "haldi",
 *   "jeera", "लाल मिर्च" find turmeric, cumin and red chilli.
 * - Small typos: "turmric", "cardamon", "corriander".
 * - Partly typed words, for suggestions as you type: "turm".
 *
 * Every meaningful word in the search has to match (so "turmeric chilli"
 * doesn't list all turmeric). Words like "powder" or "organic" only help the
 * ranking, because they're often not in the product name.
 *
 * Owners can add more names for a product as tags (Admin > Products).
 */

/** Words that mean the same thing. Each group is one idea; the first entry is the English name. */
export const SPICE_SYNONYMS: string[][] = [
  ["turmeric", "haldi", "haldee", "manjal", "pasupu", "हल्दी"],
  ["cumin", "jeera", "jira", "zeera", "jeerakam", "जीरा"],
  ["coriander", "dhania", "dhaniya", "dhaniya seeds", "धनिया"],
  ["chilli", "chili", "chile", "chillies", "mirch", "mirchi", "lal mirch", "red chilli", "मिर्च", "लाल मिर्च"],
  ["black pepper", "pepper", "kali mirch", "kalimirch", "peppercorn", "काली मिर्च"],
  ["cardamom", "elaichi", "ilaichi", "elachi", "elaichi green", "इलायची"],
  ["black cardamom", "badi elaichi", "kali elaichi", "बड़ी इलायची"],
  ["clove", "cloves", "laung", "lavang", "लौंग"],
  ["cinnamon", "dalchini", "dalchinni", "दालचीनी"],
  ["fenugreek", "methi", "मेथी"],
  ["kasuri methi", "dried fenugreek leaves", "कसूरी मेथी"],
  ["mustard", "rai", "sarson", "sarso", "राई", "सरसों"],
  ["asafoetida", "hing", "heeng", "हींग"],
  ["carom", "ajwain", "ajowan", "ajwine", "अजवाइन"],
  ["fennel", "saunf", "sonf", "सौंफ"],
  ["nigella", "kalonji", "onion seeds", "कलौंजी"],
  ["bay leaf", "bay leaves", "tej patta", "tejpatta", "तेज पत्ता"],
  ["dry ginger", "saunth", "sonth", "सौंठ"],
  ["ginger", "adrak", "अदरक"],
  ["dry mango", "mango powder", "amchur", "amchoor", "आमचूर"],
  ["black salt", "kala namak", "काला नमक"],
  ["star anise", "chakra phool", "chakriphool", "badiyan"],
  ["nutmeg", "jaiphal", "जायफल"],
  ["mace", "javitri", "जावित्री"],
  ["poppy seeds", "khus khus", "khuskhus", "khaskhas", "posta"],
  ["sesame", "til", "तिल"],
  ["saffron", "kesar", "केसर"],
  ["tamarind", "imli", "इमली"],
  ["curry leaves", "kadi patta", "kari patta", "कढ़ी पत्ता"],
  ["garlic", "lahsun", "lehsun", "लहसुन"],
  ["caraway", "shahi jeera", "shah jeera", "शाही जीरा"],
  ["pomegranate seeds", "anardana", "अनारदाना"],
  ["garam masala", "गरम मसाला"],
  ["chaat masala", "chat masala", "चाट मसाला"],
  ["powder", "ground", "pisa", "pisi", "पिसा", "पाउडर"],
];

/** Words that describe rather than identify a product: they boost the ranking but aren't required. */
const SOFT_WORDS = new Set(["powder", "ground", "pisa", "pisi", "whole", "organic", "pure", "fresh", "natural", "premium", "spice", "spices", "seed", "seeds", "the", "and", "of", "for", "with", "a"]);

export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents (Devanagari marks are outside this range and kept)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

const words = (text: string) => normalizeSearch(text).split(" ").filter(Boolean);

/** Edit distance with swaps counted as one edit (Damerau–Levenshtein), stopping early past `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** How many typos a word of this length may have and still match. */
const tolerance = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

const GROUPS = SPICE_SYNONYMS.map((g) => g.map(normalizeSearch));

// Multi-word names are joined into one word ("kali mirch" → "kali_mirch") in both the search and the
// product text, so "mirch" (chilli) doesn't match inside "kali mirch" (black pepper).
const COMPOUNDS = [...new Set(GROUPS.flat().filter((t) => t.includes(" ")))].sort((a, b) => b.length - a.length);

function joinCompounds(text: string): string {
  let out = ` ${text} `;
  for (const c of COMPOUNDS) if (out.includes(` ${c} `)) out = out.split(` ${c} `).join(` ${c.replaceAll(" ", "_")} `);
  return out.trim();
}

/** One idea in the search: any of its phrases may match. */
type Concept = { phrases: string[]; soft: boolean; typed: string };

/** Splits the search into ideas, recognising synonyms (including misspelt ones) and multi-word names. */
export function parseQuery(query: string): Concept[] {
  const tokens = words(query).slice(0, 8);
  const concepts: Concept[] = [];
  for (let i = 0; i < tokens.length; ) {
    let matched: { group: string[]; length: number } | null = null;
    for (let len = Math.min(3, tokens.length - i); len >= 1 && !matched; len--) {
      const phrase = tokens.slice(i, i + len).join(" ");
      const group = GROUPS.find((g) => g.includes(phrase)) ?? (len === 1 && phrase.length >= 4 ? GROUPS.find((g) => g.some((t) => !t.includes(" ") && editDistance(t, phrase, 2) <= tolerance(t))) : undefined);
      if (group) matched = { group, length: len };
    }
    const typed = joinCompounds(tokens.slice(i, i + (matched?.length ?? 1)).join(" "));
    const phrases = matched ? [...new Set([typed, ...matched.group.map(joinCompounds)])] : [typed];
    concepts.push({ phrases, typed, soft: SOFT_WORDS.has(typed) || (!!matched && SOFT_WORDS.has(matched.group[0])) });
    i += matched?.length ?? 1;
  }
  // A search made only of describing words ("organic powder") still has to match them.
  if (concepts.length && concepts.every((c) => c.soft)) concepts.forEach((c) => (c.soft = false));
  return concepts;
}

export type SearchDoc = { id: number; name: string; subtitle: string; tags: string[]; category: string | null; options: string[]; description: string };

type Field = { words: string[]; text: string; weight: number };

function fieldsOf(doc: SearchDoc): Field[] {
  const make = (text: string, weight: number): Field => {
    const n = joinCompounds(normalizeSearch(text));
    return { words: n.split(" ").filter(Boolean), text: ` ${n} `, weight };
  };
  return [make(doc.name, 10), make([...doc.tags, doc.category ?? ""].join(" "), 6), make(`${doc.subtitle} ${doc.options.join(" ")}`, 5), make(doc.description, 2)];
}

/** Best score for one phrase in one field: exact word/phrase > start of a word > close spelling. */
function phraseScore(phrase: string, field: Field, allowPrefix: boolean): number {
  if (field.text.includes(` ${phrase} `)) return field.weight;
  if (allowPrefix && phrase.length >= 2 && field.words.some((w) => w.startsWith(phrase))) return field.weight * 0.8;
  // Joined multi-word names must match exactly ("lal_mirch" is two letters from "kali_mirch").
  const t = phrase.includes("_") ? 0 : tolerance(phrase);
  if (t && field.words.some((w) => w.length >= 3 && !w.includes("_") && editDistance(phrase, w, t) <= t)) return field.weight * 0.6;
  return 0;
}

/**
 * Ranks products for a search. Returns matching ids, best first.
 * `prefix` lets the last word match the start of a word (for suggestions while typing).
 */
export function rankProducts(docs: SearchDoc[], query: string, opts: { prefix?: boolean } = {}): number[] {
  const concepts = parseQuery(query);
  if (!concepts.length) return [];
  const scored: { id: number; score: number; order: number }[] = [];
  docs.forEach((doc, order) => {
    const fields = fieldsOf(doc);
    let total = 0;
    for (const [ci, c] of concepts.entries()) {
      const prefix = !!opts.prefix && ci === concepts.length - 1;
      let best = 0;
      for (const phrase of c.phrases) {
        // The words actually typed count a little more than their synonyms.
        const bonus = phrase === c.typed ? 1 : 0.9;
        for (const f of fields) best = Math.max(best, phraseScore(phrase, f, prefix && phrase === c.typed) * bonus);
      }
      if (!best && !c.soft) return;
      total += best;
    }
    if (total > 0) scored.push({ id: doc.id, score: total, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.id);
}

/** For a search with no results: the same search with each unknown word swapped for the closest known one. */
export function didYouMean(docs: SearchDoc[], query: string): string | null {
  const vocabulary = new Set<string>();
  for (const d of docs) for (const w of words([d.name, d.subtitle, d.category ?? "", ...d.tags].join(" "))) if (w.length >= 3) vocabulary.add(w);
  for (const g of GROUPS) for (const t of g) if (!t.includes(" ")) vocabulary.add(t);
  let changed = false;
  const fixed = words(query).map((w) => {
    if (vocabulary.has(w) || w.length < 4) return w;
    let best: { word: string; d: number } | null = null;
    for (const v of vocabulary) {
      const d = editDistance(w, v, 3);
      if (d <= Math.min(3, Math.ceil(w.length * 0.4)) && (!best || d < best.d)) best = { word: v, d };
    }
    if (!best) return w;
    changed = true;
    return best.word;
  });
  const suggestion = fixed.join(" ");
  return changed && rankProducts(docs, suggestion).length ? suggestion : null;
}
