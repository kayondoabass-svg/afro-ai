import { describe, expect, it } from "vitest";
import { normalizeSendingDomain, prepareAuthOrigins, readableApiError } from "../../shared/customer-api-setup";
import { validTenantOrigin } from "../../shared/tenant-origins";
import { emailDomainError } from "../email-domain-errors";
import { formatRecordsForUi } from "../resend-domains";
import { parseDnsInstructions } from "../../shared/email-dns-instructions";

describe("customer API setup", () => {
  it("normalizes exact origins, root slashes and duplicate lines", () => {
    expect(prepareAuthOrigins(" HTTPS://EXAMPLE.COM/ \nhttps://www.example.com\nhttps://example.com")).toEqual(["https://example.com", "https://www.example.com"]);
    expect(prepareAuthOrigins("http://localhost:3000\nhttp://127.0.0.1:5173")).toHaveLength(2);
    expect(prepareAuthOrigins("")).toEqual([]);
  });
  it.each(["https://*.example.com", "https://www*.example.com", "https://example.com/login", "https://example.com?x=1", "https://example.com#x", "https://name:password@example.com", "http://example.com", "example.com"])("rejects unsafe or incomplete origin %s", value => {
    expect(() => prepareAuthOrigins(value)).toThrow("Line 1");
  });
  it("blocks wildcard origins in the Worker validator too", () => {
    expect(validTenantOrigin("https://*.example.com")).toBe(false);
    expect(validTenantOrigin("https://www*.example.com")).toBe(false);
  });
  it("enforces the actual ten-origin maximum", () => {
    expect(() => prepareAuthOrigins(Array.from({length: 11}, (_, i) => `https://site${i}.example.com`).join("\n"))).toThrow("at most 10");
  });
  it("accepts bare DNS domains and IDN domains", () => {
    expect(normalizeSendingDomain(" Example.COM ")).toBe("example.com");
    expect(normalizeSendingDomain("mail.example.com")).toBe("mail.example.com");
    expect(normalizeSendingDomain("bücher.example")).toBe("xn--bcher-kva.example");
  });
  it.each(["https://example.com/", "person@example.com", "*.example.com", "example.com/path", "localhost", "127.0.0.1", "-bad.example", "bad-.example", "bad..example", "example.com:443", "example.com.", null])("rejects a non-domain %s", value => {
    expect(() => normalizeSendingDomain(value)).toThrow();
  });
  it.each(["Your plan includes 1 domain. Upgrade to add more.", "You have reached the domain limit of your plan. Upgrade to add more."])("explains operator capacity without asking customers to upgrade", message => {
    const result = emailDomainError(new Error(message));
    expect(result.status).toBe(503);
    expect(result.code).toBe("EMAIL_DOMAIN_CAPACITY");
    expect(result.error).toContain("upgrading your customer app will not resolve");
  });
  it("does not expose database errors or credentials", () => {
    expect(emailDomainError(new Error("Failed query: insert ... params: private-user-value")).error).not.toContain("private-user-value");
    expect(emailDomainError(new Error("RESEND_API_KEY is not set")).code).toBe("EMAIL_PROVIDER_CONFIGURATION");
  });
  it("extracts a readable API error instead of showing HTTP/JSON syntax", () => {
    expect(readableApiError(new Error('503: {"error":"Provider capacity unavailable"}'), "Failed")).toBe("Provider capacity unavailable");
  });
  it("preserves DNS hostnames and zero MX priority without fabricated records", () => {
    const data = formatRecordsForUi([{type:"MX",name:"send.example.com",value:"feedback-smtp.example.net",priority:0,record:"SPF",ttl:"Auto",status:"pending"}]);
    expect(data.spfText).toContain("send.example.com");
    expect(data.spfText).toContain("priority 0");
    expect(data.dmarcText).toBe("");
    expect(formatRecordsForUi(undefined)).toEqual({dkimText:"",spfText:"",dmarcText:""});
  });
  it("separates DNS values from their names and preserves priorities", () => {
    expect(parseDnsInstructions("MX send.example.com → feedback-smtp.example.net (priority 0)", "spf").records).toEqual([{type:"MX",name:"send.example.com",value:"feedback-smtp.example.net",priority:0}]);
    expect(parseDnsInstructions("token._domainkey.example.com → token.dkim.amazonses.com", "dkim").records[0].type).toBe("CNAME");
    expect(parseDnsInstructions("TXT resend._domainkey → long-public-DKIM-value", "dkim").records[0].value).toBe("long-public-DKIM-value");
    expect(parseDnsInstructions("unknown provider instruction", "dkim").unparsed).toHaveLength(1);
  });
});
