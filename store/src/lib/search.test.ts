import { describe, expect, it } from "vitest";
import { didYouMean, editDistance, parseQuery, rankProducts, type SearchDoc } from "./search";

const doc = (id: number, name: string, extra: Partial<SearchDoc> = {}): SearchDoc => ({ id, name, subtitle: "", tags: [], category: null, options: [], description: "", ...extra });

const docs: SearchDoc[] = [
  doc(1, "Lakadong Turmeric", { category: "Ground Spices", options: ["Powder", "250 g"] }),
  doc(2, "Cumin Seeds", { category: "Whole Spices", subtitle: "Bold, earthy jeera from Rajasthan" }),
  doc(3, "Kashmiri Red Chilli", { category: "Ground Spices", options: ["Powder", "Whole"] }),
  doc(4, "Garam Masala", { category: "Masala Blends", description: "With cumin, cardamom and clove." }),
  doc(5, "Green Cardamom", { category: "Whole Spices" }),
  doc(6, "Tellicherry Black Pepper", { category: "Whole Spices", tags: ["kali mirch"] }),
  doc(7, "Raisins and Almonds Gift Box", { category: "Gift Boxes" }),
];

const search = (q: string, prefix = false) => rankProducts(docs, q, { prefix });

describe("search", () => {
  it("counts typos, including swapped letters", () => {
    expect(editDistance("turmeric", "turmric")).toBe(1);
    expect(editDistance("cardamom", "cardamon")).toBe(1);
    expect(editDistance("cumin", "cmuin")).toBe(1);
    expect(editDistance("cumin", "pepper", 2)).toBeGreaterThan(2);
  });

  it("finds products by Hindi names, in English letters or Devanagari", () => {
    expect(search("haldi")).toEqual([1]);
    expect(search("हल्दी")).toEqual([1]);
    expect(search("jeera")[0]).toBe(2);
    expect(search("lal mirch")).toEqual([3]);
    expect(search("इलायची")[0]).toBe(5);
  });

  it("forgives small spelling mistakes, in names and in Hindi words", () => {
    expect(search("turmric")).toEqual([1]);
    expect(search("cardamon")[0]).toBe(5);
    expect(search("haldii")).toEqual([1]);
    expect(search("kashmiri chili")).toEqual([3]);
  });

  it("ranks name matches above mentions in the description", () => {
    expect(search("cumin")).toEqual([2, 4]);
  });

  it("needs every real word to match, but not describing words like 'powder'", () => {
    expect(search("turmeric chilli")).toEqual([]);
    expect(search("turmeric powder")).toEqual([1]);
    expect(search("organic cumin")[0]).toBe(2);
  });

  it("matches the start of the last word while typing, without loose matches for short synonyms", () => {
    expect(search("turm", true)).toEqual([1]);
    expect(search("rai")).toEqual([]); // mustard, not "raisins"
  });

  it("finds products by owner-added tags", () => {
    expect(search("kali mirch")).toEqual([6]);
  });

  it("recognises multi-word synonyms and soft-only searches", () => {
    expect(parseQuery("lal mirch powder").map((c) => c.soft)).toEqual([false, true]);
    expect(search("powder").sort()).toEqual([1, 3]);
  });

  it("suggests a corrected search when nothing matches", () => {
    expect(search("kardmum")).toEqual([]);
    expect(didYouMean(docs, "kardmum")).toBe("cardamom");
    expect(didYouMean(docs, "xyzzy")).toBeNull();
  });
});
