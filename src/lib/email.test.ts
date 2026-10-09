import { describe, it, expect } from "vitest";
import { resolveEmailDelivery } from "./email";

const message = { to: "person@example.com", subject: "Confirm your subscription" };

describe("resolveEmailDelivery", () => {
  it("sends to the recipient in production, redirect or not", () => {
    expect(
      resolveEmailDelivery(message, { VERCEL_ENV: "production", EMAIL_REDIRECT_TO: "qa@example.test" }),
    ).toEqual({ kind: "send", ...message });
  });

  it("redirects every preview email to the configured inbox and keeps the recipient in the subject", () => {
    expect(
      resolveEmailDelivery(message, { VERCEL_ENV: "preview", EMAIL_REDIRECT_TO: " qa@example.test " }),
    ).toEqual({
      kind: "send",
      to: "qa@example.test",
      subject: "[to: person@example.com] Confirm your subscription",
    });
  });

  // A preview that silently delivered to real addresses would be worse than a
  // preview that cannot send at all.
  it("refuses to send outside production when no redirect inbox is set", () => {
    expect(resolveEmailDelivery(message, { VERCEL_ENV: "preview" }).kind).toBe("refuse");
    expect(resolveEmailDelivery(message, { VERCEL_ENV: "preview", EMAIL_REDIRECT_TO: "" }).kind).toBe("refuse");
    expect(resolveEmailDelivery(message, {}).kind).toBe("refuse");
  });
});
