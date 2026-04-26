// Shared constants for the team-management feature.
// Used by both client (UI dropdowns) and server (validation).

export const TEAM_ROLES = [
  { value: "ceo", label: "CEO" },
  { value: "manager", label: "Manager" },
  { value: "marketing_manager", label: "Marketing Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "sales_supervisor", label: "Sales Supervisor" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "regional_supervisor", label: "Regional Supervisor" },
  { value: "email_api_manager", label: "Email API Manager" },
  { value: "chatbot_manager", label: "Chatbot Manager" },
  { value: "ussd_manager", label: "USSD Manager" },
  { value: "customer_support_lead", label: "Customer Support Lead" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "product_manager", label: "Product Manager" },
  { value: "content_manager", label: "Content Manager" },
  { value: "tech_lead", label: "Tech Lead" },
  { value: "compliance_officer", label: "Compliance Officer" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "partnerships_manager", label: "Partnerships Manager" },
] as const;

export type TeamRoleValue = typeof TEAM_ROLES[number]["value"];

// Roles that grant access to the dedicated staff dashboard
export const MANAGER_ROLES: TeamRoleValue[] = [
  "ceo",
  "manager",
  "marketing_manager",
  "sales_manager",
  "regional_manager",
  "email_api_manager",
  "chatbot_manager",
  "ussd_manager",
  "operations_manager",
  "product_manager",
  "tech_lead",
];

// Roles allowed to view confidential ID documents.
// Per founder spec: founders + HR only. (CEO/Compliance go through founder.)
export const CONFIDENTIAL_DOC_VIEWER_ROLES: TeamRoleValue[] = [
  "hr_manager",
];

export const TEAM_TIERS = [
  { value: "read_only", label: "Read-only", description: "View only — no changes allowed" },
  { value: "editor", label: "Editor", description: "View and edit, no deletions or settings" },
  { value: "full_admin", label: "Full Admin", description: "Full power within their assigned area" },
] as const;

export type TeamTierValue = typeof TEAM_TIERS[number]["value"];

export const TEAM_STATUSES = ["active", "suspended", "removed"] as const;
export type TeamStatusValue = typeof TEAM_STATUSES[number];

// Major African markets — ISO-2 country codes
export const AFRICAN_COUNTRIES = [
  { code: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "CI", name: "Ivory Coast", flag: "🇨🇮" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "BW", name: "Botswana", flag: "🇧🇼" },
  { code: "AO", name: "Angola", flag: "🇦🇴" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿" },
  { code: "CD", name: "DR Congo", flag: "🇨🇩" },
  { code: "SD", name: "Sudan", flag: "🇸🇩" },
  { code: "LY", name: "Libya", flag: "🇱🇾" },
  { code: "ML", name: "Mali", flag: "🇲🇱" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫" },
] as const;

export type CountryCode = typeof AFRICAN_COUNTRIES[number]["code"];

export const TEAM_ROLE_VALUES = TEAM_ROLES.map(r => r.value);
export const TEAM_TIER_VALUES = TEAM_TIERS.map(t => t.value);
export const COUNTRY_CODES = AFRICAN_COUNTRIES.map(c => c.code);

export function getRoleLabel(value: string): string {
  return TEAM_ROLES.find(r => r.value === value)?.label || value;
}

export function getCountryName(code: string): string {
  return AFRICAN_COUNTRIES.find(c => c.code === code)?.name || code;
}

export function getCountryFlag(code: string): string {
  return AFRICAN_COUNTRIES.find(c => c.code === code)?.flag || "";
}

export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.includes(role as TeamRoleValue);
}

export function canViewConfidentialDocs(role: string): boolean {
  return CONFIDENTIAL_DOC_VIEWER_ROLES.includes(role as TeamRoleValue);
}
