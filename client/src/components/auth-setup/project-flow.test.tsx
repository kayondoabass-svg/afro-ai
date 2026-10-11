import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import ProjectPage from "@/pages/afro-auth-project";

vi.mock("wouter", async (original) => ({
  ...await original<typeof import("wouter")>(),
  useRoute: () => [true, {id:"fixture-project"}],
  useLocation: () => ["/dashboard/auth/fixture-project", vi.fn()],
}));
afterEach(() => queryClient.clear());
function renderProject(verified: boolean) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const domain = {id:"domain-fixture",domain:"example.com",status:"verified",created_at:0,verified_at:1,last_checked_at:1,verification:{type:"TXT",name:"_afro-auth.example.com",value:"test-public-dns-challenge",ttl:300}};
  queryClient.setQueryData(["/cf-auth/v1/admin/tenants","fixture-project"],{
    tenant:{id:"fixture-project",slug:"sample-app",name:"Sample app",plan:"free",allowed_origins:"[]",created_at:0,updated_at:0,setup_required:1},
    stats:{mau:0,mauLimit:5000,totalUsers:0},keys:[],
    setup:{required:true,canCreateKeys:verified,verifiedDomainCount:verified ? 1 : 0,userStore:"D1",userFolder:"projects/fixture-project/users"},
  });
  queryClient.setQueryData(["/cf-auth/v1/admin/tenants/fixture-project/domains"],{domains:verified ? [domain] : []});
  const container=document.createElement("div"),root=createRoot(container);document.body.append(container);
  act(() => root.render(<QueryClientProvider client={queryClient}><ProjectPage /></QueryClientProvider>));
  return {container,close:()=>{act(()=>root.unmount());container.remove();}};
}
it("renders the owner's setup and blocks production key generation before DNS proof", () => {
  const ui=renderProject(false);
  try {
    const generate=[...ui.container.querySelectorAll("button")].find(b=>/Generate.*key/i.test(b.textContent || ""));
    expect(generate).toBeDefined();expect(generate!.disabled).toBe(true);
    expect(ui.container.textContent).toContain("Sample app");
    expect(ui.container.textContent).toContain("DNS");
    expect(ui.container.textContent).toContain("sample-app");
  } finally {ui.close();}
});
it("enables key generation only after a real verified-state API response", () => {
  const ui=renderProject(true);
  try {
    const generate=[...ui.container.querySelectorAll("button")].find(b=>/Generate.*key/i.test(b.textContent || ""));
    expect(generate!.disabled).toBe(false);
    expect(ui.container.textContent).toContain("example.com");
    expect(ui.container.textContent).toContain("Verified");
    expect(ui.container.textContent).toContain("/cf-auth/v1/t/sample-app");
  } finally {ui.close();}
});
