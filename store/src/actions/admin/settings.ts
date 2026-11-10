"use server";

import { refresh, updateTag } from "next/cache";
import type { z } from "zod";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { SETTINGS_FORM_SCHEMAS } from "@/lib/form-schemas";
import { fieldErrorsFrom, formValues, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { readSettings, writeSettings, type SettingsKey } from "@/server/settings";

export type SettingsResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function saveSettingsAction(key: SettingsKey, _prev: SettingsResult, fd: FormData): Promise<SettingsResult> {
  const staff = await requireStaffAction("settings.manage");
  const db = getDb();
  const parsed = SETTINGS_FORM_SCHEMAS[key].safeParse(formValues(fd));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  switch (key) {
    case "store": {
      const d = parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["store"]>;
      await writeSettings(db, "store", { ...d, tradeName: d.tradeName || "The Farm Door" });
      break;
    }
    case "shipping": {
      const d = parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["shipping"]>;
      await writeSettings(db, "shipping", {
        pickupPincode: d.pickupPincode,
        freeShippingThresholdPaise: d.freeShippingOn ? d.freeShippingThreshold : null,
        handlingFeePaise: d.handlingFee ?? 0,
        packagingWeightGrams: d.packagingWeightGrams,
        boxLengthCm: d.boxLengthCm,
        boxBreadthCm: d.boxBreadthCm,
        boxHeightCm: d.boxHeightCm,
        courierChoice: d.courierChoice,
      });
      break;
    }
    case "cod": {
      const d = parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["cod"]>;
      await writeSettings(db, "cod", {
        enabled: d.enabled,
        feePaise: d.fee ?? 0,
        maxOrderPaise: d.maxOn ? d.maxOrder : null,
        blockedPincodes: d.blockedPincodes,
        confirmationHours: d.confirmationHours,
      });
      break;
    }
    case "checkout":
      await writeSettings(db, "checkout", parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["checkout"]>);
      break;
    case "notifications":
      await writeSettings(db, "notifications", parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["notifications"]>);
      break;
    case "loyalty": {
      const d = parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["loyalty"]>;
      await writeSettings(db, "loyalty", {
        pointsEnabled: d.pointsEnabled,
        pointsPerHundredRupees: d.pointsPerHundredRupees,
        pointValuePaise: d.pointValue,
        maxRedeemPercent: d.maxRedeemPercent,
        minPointsToRedeem: d.minPointsToRedeem,
        referralsEnabled: d.referralsEnabled,
        referralDiscountPercent: d.referralDiscountPercent,
        referralMaxDiscountPaise: d.referralMaxDiscount,
        referralRewardPoints: d.referralRewardPoints,
      });
      break;
    }
    case "whatsapp":
      await writeSettings(db, "whatsapp", parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["whatsapp"]>);
      break;
    case "analytics":
      await writeSettings(db, "analytics", parsed.data as z.output<(typeof SETTINGS_FORM_SCHEMAS)["analytics"]>);
      break;
  }
  await logAudit(db, { staffUserId: staff.id, action: "settings.update", entityType: "settings", entityId: key, data: (await readSettings(db, key)) as Record<string, unknown> });
  updateTag("settings");
  refresh();
  return { ok: true, message: "Saved." };
}
