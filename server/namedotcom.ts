const NAME_COM_API_URL = process.env.NAMEDOTCOM_API_URL || "https://api.name.com/v4";
const NAME_COM_USER = process.env.NAMEDOTCOM_API_USER || "kayondoabass@gmail.com";
const NAME_COM_TOKEN = process.env.NAMEDOTCOM_API_TOKEN || process.env.NAMECHEAP_API_KEY || "";

function getAuthHeader(): string {
  const encoded = Buffer.from(`${NAME_COM_USER}:${NAME_COM_TOKEN}`).toString("base64");
  return `Basic ${encoded}`;
}

async function nameComRequest(method: string, path: string, body?: object): Promise<any> {
  const res = await fetch(`${NAME_COM_API_URL}${path}`, {
    method,
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `name.com API error: ${res.status}`);
  }
  return data;
}

// Markup percentage over cost price
const MARKUP = 0.35;

function applyMarkup(price: number): number {
  return parseFloat((price * (1 + MARKUP)).toFixed(2));
}

export interface DomainAvailability {
  domainName: string;
  available: boolean;
  purchasable: boolean;
  premium: boolean;
  purchasePrice: number | null;
  retailPrice: number | null;
  renewalPrice: number | null;
  currency: string;
}

export interface DomainContact {
  firstName: string;
  lastName: string;
  companyName?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
}

export interface DomainOrder {
  domainName: string;
  totalPaid: number;
  expirationDate: string;
  nameservers: string[];
}

// Check availability for a search term across popular TLDs
export async function checkDomainAvailability(searchTerm: string): Promise<DomainAvailability[]> {
  const tlds = [".com", ".net", ".org", ".io", ".co", ".africa", ".shop", ".online", ".tech", ".app", ".store", ".biz", ".info", ".co.ke", ".com.ng", ".co.ug", ".co.za"];
  const domainNames = tlds.map(tld => searchTerm.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + tld);

  const data = await nameComRequest("POST", "/domains:checkAvailability", { domainNames });
  const results: DomainAvailability[] = (data.results || []).map((r: any) => ({
    domainName: r.domainName,
    available: r.purchasable === true,
    purchasable: r.purchasable === true,
    premium: r.premium === true,
    purchasePrice: r.purchasePrice ? applyMarkup(r.purchasePrice) : null,
    retailPrice: r.purchasePrice ? applyMarkup(r.purchasePrice) : null,
    renewalPrice: r.renewalPrice ? applyMarkup(r.renewalPrice) : null,
    currency: "USD",
  }));
  return results;
}

// Check a single domain
export async function checkSingleDomain(domainName: string): Promise<DomainAvailability> {
  const data = await nameComRequest("POST", "/domains:checkAvailability", { domainNames: [domainName] });
  const r = (data.results || [])[0];
  if (!r) throw new Error("Domain check failed");
  return {
    domainName: r.domainName,
    available: r.purchasable === true,
    purchasable: r.purchasable === true,
    premium: r.premium === true,
    purchasePrice: r.purchasePrice ? applyMarkup(r.purchasePrice) : null,
    retailPrice: r.purchasePrice ? applyMarkup(r.purchasePrice) : null,
    renewalPrice: r.renewalPrice ? applyMarkup(r.renewalPrice) : null,
    currency: "USD",
  };
}

// Register a domain
export async function registerDomain(
  domainName: string,
  contacts: DomainContact,
  purchasePriceAtCost: number,
  years: number = 1
): Promise<any> {
  const contactObj = {
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    companyName: contacts.companyName || "",
    address1: contacts.address1,
    address2: contacts.address2 || "",
    city: contacts.city,
    state: contacts.state,
    zip: contacts.zip,
    country: contacts.country,
    phone: contacts.phone,
    fax: "",
    email: contacts.email,
  };

  const body: any = {
    domain: { domainName },
    purchasePrice: purchasePriceAtCost,
    years,
    contacts: {
      registrant: contactObj,
      admin: contactObj,
      tech: contactObj,
      billing: contactObj,
    },
  };

  return nameComRequest("POST", "/domains", body);
}

// List reseller's domains
export async function listDomains(page: number = 1): Promise<any> {
  return nameComRequest("GET", `/domains?page=${page}&perPage=50`);
}

// Get a specific domain
export async function getDomainInfo(domainName: string): Promise<any> {
  return nameComRequest("GET", `/domains/${domainName}`);
}

// Renew a domain
export async function renewDomain(domainName: string, years: number = 1, purchasePriceAtCost?: number): Promise<any> {
  const body: any = { years };
  if (purchasePriceAtCost) body.purchasePrice = purchasePriceAtCost;
  return nameComRequest("POST", `/domains/${domainName}:renew`, body);
}

// Get nameservers
export async function getNameservers(domainName: string): Promise<string[]> {
  const data = await nameComRequest("GET", `/domains/${domainName}`);
  return data.nameservers || [];
}

// Set nameservers
export async function setNameservers(domainName: string, nameservers: string[]): Promise<any> {
  return nameComRequest("POST", `/domains/${domainName}:setNameservers`, { nameservers });
}

// Get cost price for a domain (before markup)
export async function getCostPrice(domainName: string): Promise<number | null> {
  const data = await nameComRequest("POST", "/domains:checkAvailability", { domainNames: [domainName] });
  const r = (data.results || [])[0];
  return r?.purchasePrice || null;
}
