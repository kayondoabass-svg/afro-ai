import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EmailDnsRecords } from "./email-dns-records";
import { SettingsForm } from "../pages/afro-auth-project";

describe("customer setup controls", () => {
  it("copies just the DNS value instead of a formatted instruction", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div"), root = createRoot(container), copy = vi.fn();
    document.body.append(container);
    try {
      act(() => root.render(<EmailDnsRecords domain={{dkimToken:"TXT resend._domainkey → public-DKIM-value",spfRecord:null,dmarcRecord:null}} onCopy={copy} />));
      const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Copy value")!;
      act(() => button.click());
      expect(copy).toHaveBeenCalledWith("public-DKIM-value", "DNS value");
      expect(container.textContent).toContain("resend._domainkey");
    } finally { act(() => root.unmount()); container.remove(); }
  });
  it("blocks an invalid website origin without making a save request", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div"), root = createRoot(container), save = vi.fn();
    document.body.append(container);
    try {
      act(() => root.render(<SettingsForm tenant={{id:"sample",slug:"sample",name:"Sample",plan:"starter",allowed_origins:'["https://*.example.com"]',created_at:0,updated_at:0}} onSave={save} saving={false} />));
      act(() => (container.querySelector('[data-testid="button-save-origins"]') as HTMLButtonElement).click());
      expect(save).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("No wildcards");
    } finally { act(() => root.unmount()); container.remove(); }
  });
});
