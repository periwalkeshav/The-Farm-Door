/**
 * Field rules shared by the browser (instant feedback while filling a form)
 * and the server (the real check: anything from the browser can be forged).
 * Keep this file free of server-only imports.
 */
import { z } from "zod";
import { isIndianState, isValidGstin, isValidPincode, normalizeIndianMobile, stateCode } from "./india";
import { rupeesToPaise } from "./money";

export type FieldErrors = Record<string, string>;

/** First message for each top-level field. */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Reads a FormData into a plain object (repeated names become arrays). */
export function formValues(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export const rules = {
  email: (empty = "Enter your email address.") =>
    z.preprocess(text, z.string().trim().min(1, empty).max(200, "That email address is too long.").pipe(z.email("Enter a valid email address, like name@example.com."))).transform((v) => v.toLowerCase()),

  optionalEmail: () =>
    z.preprocess(text, z.string().trim().max(200, "That email address is too long.")).refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address, like name@example.com."),

  /** Indian mobile, normalised to 10 digits. */
  mobile: (empty = "Enter a mobile number.") =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, empty)
        .transform((v, ctx) => {
          const n = normalizeIndianMobile(v);
          if (!n) {
            ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)." });
            return z.NEVER;
          }
          return n;
        }),
    ),

  optionalMobile: () =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .transform((v, ctx) => {
          if (v === "") return "";
          const n = normalizeIndianMobile(v);
          if (!n) {
            ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)." });
            return z.NEVER;
          }
          return n;
        }),
    ),

  /** Landline or mobile, as shown to customers (e.g. "+91 141 400 0000"). */
  optionalPhone: () =>
    z
      .preprocess(text, z.string().trim().max(30, "That phone number is too long."))
      .refine((v) => v === "" || (/^[+\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 13), "Enter a phone number with area code, using digits, spaces, + or -."),

  personName: (empty = "Enter a name.") =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, empty)
        .min(2, "That name is too short.")
        .max(80, "Keep the name under 80 characters.")
        .refine((v) => /\p{L}/u.test(v), "Use letters for the name.")
        .refine((v) => !/\d/.test(v), "Names can't contain numbers."),
    ),

  optionalPersonName: () =>
    z
      .preprocess(text, z.string().trim().max(80, "Keep the name under 80 characters."))
      .refine((v) => v === "" || v.length >= 2, "That name is too short.")
      .refine((v) => v === "" || /\p{L}/u.test(v), "Use letters for the name.")
      .refine((v) => !/\d/.test(v), "Names can't contain numbers."),

  pincode: () => z.preprocess(text, z.string().trim().min(1, "Enter the 6-digit pincode.").refine(isValidPincode, "Enter a valid 6-digit pincode (it can't start with 0).")),

  optionalPincode: () => z.preprocess(text, z.string().trim()).refine((v) => v === "" || isValidPincode(v), "Enter a valid 6-digit pincode (it can't start with 0)."),

  city: () =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, "Enter the city or town.")
        .min(2, "Enter the full city or town name.")
        .max(80, "Keep the city under 80 characters.")
        .refine((v) => /\p{L}/u.test(v) && !/\d/.test(v), "Use letters for the city."),
    ),

  optionalCity: () =>
    z
      .preprocess(text, z.string().trim().max(80, "Keep the city under 80 characters."))
      .refine((v) => v === "" || (v.length >= 2 && /\p{L}/u.test(v) && !/\d/.test(v)), "Use letters for the city."),

  state: () => z.preprocess(text, z.string().min(1, "Choose a state.").refine(isIndianState, "Choose a state from the list.")),

  optionalState: () => z.preprocess(text, z.string()).refine((v) => v === "" || isIndianState(v), "Choose a state from the list."),

  gstin: () =>
    z
      .preprocess(text, z.string().trim().toUpperCase().max(15, "A GSTIN has 15 characters."))
      .refine((v) => v === "" || v.length === 15, "A GSTIN has 15 characters, e.g. 08ABCDE1234F1Z0.")
      .refine((v) => v.length !== 15 || isValidGstin(v), "That GSTIN isn't valid. Check each character."),

  /** Optional plain text with a length limit. */
  optionalText: (max: number, label = "This") => z.preprocess(text, z.string().trim().max(max, `${label} must be ${max} characters or fewer.`)),

  requiredText: (empty: string, min: number, max: number, label = "This") =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, empty)
        .min(min, `${label} needs at least ${min} characters.`)
        .max(max, `${label} must be ${max} characters or fewer.`),
    ),

  /** Rupee amount as typed ("249" or "249.50"), returned in paise. */
  rupees: (empty: string, opts: { min?: number; allowZero?: boolean } = {}) =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, empty)
        .transform((v, ctx) => {
          const p = rupeesToPaise(v);
          if (p === null) {
            ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, like 249 or 249.50." });
            return z.NEVER;
          }
          if (!opts.allowZero && p === 0) {
            ctx.addIssue({ code: "custom", message: "Enter an amount above zero." });
            return z.NEVER;
          }
          if (opts.min !== undefined && p < opts.min) {
            ctx.addIssue({ code: "custom", message: `Enter at least ₹${opts.min / 100}.` });
            return z.NEVER;
          }
          return p;
        }),
    ),

  optionalRupees: () =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .transform((v, ctx) => {
          if (v === "") return null;
          const p = rupeesToPaise(v);
          if (p === null) {
            ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, like 249 or 249.50." });
            return z.NEVER;
          }
          return p;
        }),
    ),

  /** Whole number typed into a field. */
  wholeNumber: (label: string, min: number, max: number) =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .min(1, `Enter ${label}.`)
        .refine((v) => /^\d+$/.test(v), `Enter ${label} as a whole number.`)
        .transform(Number)
        .refine((n) => n >= min && n <= max, `${label[0].toUpperCase()}${label.slice(1)} must be between ${min} and ${max}.`),
    ),

  optionalWholeNumber: (label: string, min: number, max = 1_000_000) =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d+$/.test(v), `Enter ${label} as a whole number, or leave it empty.`)
        .transform((v) => (v === "" ? null : Number(v)))
        .refine((n) => n === null || (n >= min && n <= max), `${label[0].toUpperCase()}${label.slice(1)} must be between ${min} and ${max}.`),
    ),

  /** Decimal quantity such as "2.5" (kg). */
  decimal: (label: string, opts: { min?: number; max?: number; allowEmpty?: boolean; positive?: boolean } = {}) =>
    z.preprocess(
      text,
      z
        .string()
        .trim()
        .refine((v) => (opts.allowEmpty && v === "") || v !== "", `Enter ${label}.`)
        .refine((v) => v === "" || /^\d+(\.\d{1,3})?$/.test(v), `Enter ${label} as a number, like 2 or 2.5.`)
        .transform((v) => (v === "" ? null : Number(v)))
        .refine((n) => n === null || !opts.positive || n > 0, `${label[0].toUpperCase()}${label.slice(1)} must be more than zero.`)
        .refine((n) => n === null || opts.min === undefined || n >= opts.min, `${label[0].toUpperCase()}${label.slice(1)} can't be less than ${opts.min}.`)
        .refine((n) => n === null || opts.max === undefined || n <= opts.max, `${label[0].toUpperCase()}${label.slice(1)} can't be more than ${opts.max}.`),
    ),

  httpsUrl: (label: string) =>
    z
      .preprocess(text, z.string().trim().max(200, "That link is too long."))
      .refine((v) => v === "" || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v), `${label} must be a full link starting with https://`),

  /** FSSAI licence / registration numbers are 14 digits. */
  fssai: () =>
    z
      .preprocess(text, z.string().overwrite((v) => v.replace(/\s/g, "")))
      .refine((v) => v === "" || /^\d{14}$/.test(v), "An FSSAI licence or registration number has 14 digits."),

  /** Company identification number, e.g. U01100RJ2025PTC012345. */
  cin: () =>
    z
      .preprocess(text, z.string().toUpperCase().overwrite((v) => v.replace(/\s/g, "")))
      .refine((v) => v === "" || /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(v), "A CIN has 21 characters, like U01100RJ2025PTC012345."),

  sixDigitCode: (empty = "Enter the 6-digit code.") =>
    z.preprocess(
      text,
      z
        .string()
        .overwrite((v) => v.replace(/\s/g, ""))
        .min(1, empty)
        .refine((v) => /^\d{6}$/.test(v), "The code is 6 digits."),
    ),
};

/** True when a GSTIN's first two digits match the state's GST code. */
export function gstinMatchesState(gstin: string, state: string): boolean {
  const code = stateCode(state);
  return !gstin || !code || gstin.slice(0, 2) === code;
}
