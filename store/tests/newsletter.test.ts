import { beforeEach, describe, expect, it } from "vitest";
import { newsletterSubscribers } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { COMING_SOON_SOURCE, emailsFromCsv, importSubscribers } from "@/server/newsletter";
import { optOut } from "@/server/reminders";
import { db, resetDb } from "./support/db";

describe("coming-soon list import", () => {
  beforeEach(resetDb);

  it("parses quoted CSV cells", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("finds the email column, dedupes and counts bad rows", () => {
    const csv = "﻿company,email,created_at\r\n,Asha@Example.com,2026-10-17T09:00:00Z\r\n,asha@example.com,2026-10-18T09:00:00Z\r\n,not-an-email,\r\n,ravi@example.in,\r\n";
    const r = emailsFromCsv(csv);
    expect(r.invalid).toBe(1);
    expect(r.valid.map((v) => v.email).sort()).toEqual(["asha@example.com", "ravi@example.in"]);
    expect(r.valid.find((v) => v.email === "ravi@example.in")!.consentedAt).toBeNull();
  });

  it("adds new people only and never re-adds anyone who opted out", async () => {
    await db.insert(newsletterSubscribers).values({ email: "existing@example.com", source: "website" });
    await optOut(db, "gone@example.com");
    const people = ["new@example.com", "existing@example.com", "gone@example.com"].map((email) => ({ email, consentedAt: null }));
    expect(await importSubscribers(db, people, COMING_SOON_SOURCE)).toEqual({ added: 1, skipped: 2 });
    const rows = await db.select().from(newsletterSubscribers);
    expect(rows.find((r) => r.email === "existing@example.com")!.source).toBe("website");
    expect(rows.find((r) => r.email === "new@example.com")!.source).toBe(COMING_SOON_SOURCE);
  });
});
