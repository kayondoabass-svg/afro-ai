// @vitest-environment node
import { expect, it } from "vitest";
import { isTrustedPlatformOrigin } from "../platform-origins";
it("only allows exact trusted platform origins to use credentialed CORS",()=>{
  const env={REPLIT_DEV_DOMAIN:"owned.replit.dev",CLOUDFLARE_PAGES_URL:"https://owned.pages.dev"};
  for(const origin of ["https://afroaigroup.com","https://www.afroaigroup.com","https://owned.replit.dev","https://owned.pages.dev"])
    expect(isTrustedPlatformOrigin(origin,env)).toBe(true);
  for(const origin of ["https://customer.afroaigroup.com","https://evil.pages.dev","https://evil.replit.dev","https://afroaigroup.com.evil.test","null",""])
    expect(isTrustedPlatformOrigin(origin,env)).toBe(false);
});
