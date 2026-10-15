import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import EmailApiPage from "./email-api";

it.each([true,false])("shows accurate founder access without hiding customer caps (founder=%s)", async founder => {
  const cache=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  cache.setQueryData(["/api/email-api/stats"],{founderAccess:founder,emailProvider:"resend"});
  const fixtureKey = {
    id:1,name:"Fixture key",publicKey:"afro_live_test_only",secretKeyPreview:"test",plan:founder?"enterprise":"starter",
    monthlyLimit:1000,emailsSentMonth:1500,quotaExempt:founder,founderAccess:founder,isActive:true,createdAt:"2026-01-01",
  };
  cache.setQueryData(["/api/email-api/keys"],[fixtureKey]);
  cache.setQueryData(["/api/email-api/projects"],[{id:"legacy-setup",name:"Existing email setup",legacy:true,createdAt:"2026-01-01",domainCount:0,keyCount:1}]);
  cache.setQueryData(["/api/email-api/projects/legacy-setup"],{
    project:{id:"legacy-setup",name:"Existing email setup",legacy:true},
    keys:[fixtureKey],domains:[],logs:[],stats:{founderAccess:founder,emailProvider:"resend",totalSent:0,totalFailed:0,totalKeys:1,verifiedDomains:0,emailsSentThisMonth:0},
  });
  window.history.replaceState({}, "", "/email-api?project=legacy-setup");
  for (const name of ["domains","logs"]) cache.setQueryData([`/api/email-api/${name}`],[]);
  const container=document.createElement("div");document.body.appendChild(container);
  const root=createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={cache}><EmailApiPage /></QueryClientProvider>));
    expect(container.textContent?.includes("Founder — full access")).toBe(founder);
    expect(container.textContent?.includes("No customer quota (founder)")).toBe(founder);
    expect(container.textContent?.includes("1,000 emails this month")).toBe(!founder);
    if (founder) expect(container.querySelector('a[href="https://resend.com/settings/usage"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    cache.clear();container.remove();
  }
});
