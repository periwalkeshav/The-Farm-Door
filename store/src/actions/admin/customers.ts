"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { anonymiseCustomer } from "@/server/customers";

export async function anonymiseCustomerAction(customerId: number): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaffAction("staff.manage");
  try {
    await anonymiseCustomer(getDb(), customerId, staff.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't delete this customer's data." };
  }
  refresh();
  return { ok: true, message: "Personal data deleted. Order and invoice records were kept as tax law requires." };
}
