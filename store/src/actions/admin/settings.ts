"use server";

import { refresh, updateTag } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { isIndianState, isValidGstin, isValidPincode } from "@/lib/india";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { readSettings, writeSettings, type SettingsKey } from "@/server/settings";

export type SettingsResult = { ok: boolean; message: string } | null;

const str = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

function money(fd: FormData, k: string, label: string, allowEmpty = true): number | null {
  const v = str(fd, k, 20);
  if (!v) {
    if (allowEmpty) return null;
    throw new Error(`Enter ${label}.`);
  }
  const p = rupeesToPaise(v);
  if (p === null) throw new Error(`Enter ${label} in rupees, e.g. 49 or 49.50.`);
  return p;
}

function int(fd: FormData, k: string, label: string, min: number, max: number) {
  const n = Number(str(fd, k, 10));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}

export async function saveSettingsAction(key: SettingsKey, _prev: SettingsResult, fd: FormData): Promise<SettingsResult> {
  const staff = await requireStaffAction("settings.manage");
  const db = getDb();
  try {
    switch (key) {
      case "store": {
        const gstin = str(fd, "gstin", 15).toUpperCase();
        if (gstin && !isValidGstin(gstin)) throw new Error("That GSTIN isn't valid (check the 15 characters).");
        const state = str(fd, "state", 60);
        if (state && !isIndianState(state)) throw new Error("Choose the state from the list.");
        const pincode = str(fd, "pincode", 6);
        if (pincode && !isValidPincode(pincode)) throw new Error("Enter a valid 6-digit pincode.");
        const email = str(fd, "supportEmail", 120);
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid support email.");
        const urls = ["instagramUrl", "facebookUrl", "youtubeUrl"].map((k) => str(fd, k, 200));
        if (urls.some((u) => u && !/^https:\/\//.test(u))) throw new Error("Social links must start with https://");
        await writeSettings(db, "store", {
          tradeName: str(fd, "tradeName", 80) || "The Farm Door",
          legalName: str(fd, "legalName", 120),
          gstin,
          fssaiNumber: str(fd, "fssaiNumber", 20).replace(/\s/g, ""),
          addressLine1: str(fd, "addressLine1", 200),
          addressLine2: str(fd, "addressLine2", 200),
          city: str(fd, "city", 80),
          state,
          pincode,
          supportEmail: email,
          supportPhone: str(fd, "supportPhone", 30),
          whatsappNumber: str(fd, "whatsappNumber", 20),
          instagramUrl: urls[0],
          facebookUrl: urls[1],
          youtubeUrl: urls[2],
        });
        break;
      }
      case "shipping": {
        const pickupPincode = str(fd, "pickupPincode", 6);
        if (!isValidPincode(pickupPincode)) throw new Error("Enter the 6-digit pincode orders are picked up from.");
        await writeSettings(db, "shipping", {
          pickupPincode,
          freeShippingThresholdPaise: bool(fd, "freeShippingOn") ? money(fd, "freeShippingThreshold", "the free-shipping amount", false) : null,
          handlingFeePaise: money(fd, "handlingFee", "the handling fee") ?? 0,
          packagingWeightGrams: int(fd, "packagingWeightGrams", "Packaging weight", 0, 5000),
          boxLengthCm: int(fd, "boxLengthCm", "Box length", 1, 200),
          boxBreadthCm: int(fd, "boxBreadthCm", "Box breadth", 1, 200),
          boxHeightCm: int(fd, "boxHeightCm", "Box height", 1, 200),
          courierChoice: (["CHEAPEST", "FASTEST", "RECOMMENDED"].includes(str(fd, "courierChoice")) ? str(fd, "courierChoice") : "RECOMMENDED") as "CHEAPEST" | "FASTEST" | "RECOMMENDED",
        });
        break;
      }
      case "cod": {
        const blocked = [...new Set(str(fd, "blockedPincodes", 20_000).split(/[\s,]+/).filter(Boolean))];
        const bad = blocked.find((p) => !isValidPincode(p));
        if (bad) throw new Error(`"${bad}" isn't a valid pincode.`);
        await writeSettings(db, "cod", {
          enabled: bool(fd, "enabled"),
          feePaise: money(fd, "fee", "the COD fee") ?? 0,
          maxOrderPaise: bool(fd, "maxOn") ? money(fd, "maxOrder", "the maximum COD order", false) : null,
          blockedPincodes: blocked,
          confirmationHours: int(fd, "confirmationHours", "Confirmation time", 1, 168),
        });
        break;
      }
      case "checkout":
        await writeSettings(db, "checkout", { reservationMinutes: int(fd, "reservationMinutes", "Payment window", 5, 60) });
        break;
      case "notifications": {
        const ownerEmail = str(fd, "ownerEmail", 120);
        if (ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) throw new Error("Enter a valid email for alerts.");
        await writeSettings(db, "notifications", { ownerEmail, newOrderEmails: bool(fd, "newOrderEmails"), lowStockEmails: bool(fd, "lowStockEmails"), dailySummary: bool(fd, "dailySummary") });
        break;
      }
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save." };
  }
  await logAudit(db, { staffUserId: staff.id, action: "settings.update", entityType: "settings", entityId: key, data: (await readSettings(db, key)) as Record<string, unknown> });
  updateTag("settings");
  refresh();
  return { ok: true, message: "Saved." };
}
