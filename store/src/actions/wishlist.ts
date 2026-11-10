"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { getCustomer } from "@/data/session";
import { toggleSaved } from "@/server/wishlist";

export async function toggleWishlistAction(productId: number): Promise<{ saved: boolean } | { needsLogin: true }> {
  const customer = await getCustomer();
  if (!customer) return { needsLogin: true };
  const id = z.number().int().positive().parse(productId);
  const saved = await toggleSaved(getDb(), customer.id, id);
  refresh();
  return { saved };
}
