/**
 * Programme prerequisites from shared/schema.ts. Some older installations have
 * applications but never initialized attribution or commission tables.
 * Create missing tables only; never replace existing rows or replay payments.
 */
export const legacyProgrammeSchema = `
  CREATE TABLE IF NOT EXISTS affiliate_applications (
    id serial PRIMARY KEY, full_name text NOT NULL, email varchar NOT NULL UNIQUE,
    phone varchar, country varchar, promotion_method text, social_media text,
    referral_code varchar NOT NULL UNIQUE, status varchar NOT NULL DEFAULT 'pending',
    portal_token varchar UNIQUE, clicks integer NOT NULL DEFAULT 0,
    referral_count integer NOT NULL DEFAULT 0, converted_count integer NOT NULL DEFAULT 0,
    total_earned_cents integer NOT NULL DEFAULT 0, total_paid_cents integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS portal_token varchar;
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS converted_count integer NOT NULL DEFAULT 0;
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS total_earned_cents integer NOT NULL DEFAULT 0;
  ALTER TABLE affiliate_applications ADD COLUMN IF NOT EXISTS total_paid_cents integer NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX IF NOT EXISTS programme_affiliate_portal_token
    ON affiliate_applications(portal_token) WHERE portal_token IS NOT NULL;
  CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id serial PRIMARY KEY,
    affiliate_id integer NOT NULL REFERENCES affiliate_applications(id) ON DELETE CASCADE,
    referred_user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    referred_email varchar, status varchar NOT NULL DEFAULT 'signed_up',
    first_paid_at timestamp, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id serial PRIMARY KEY,
    affiliate_id integer NOT NULL REFERENCES affiliate_applications(id) ON DELETE CASCADE,
    referral_id integer REFERENCES affiliate_referrals(id) ON DELETE SET NULL,
    user_id varchar REFERENCES users(id), base_amount_cents integer NOT NULL,
    amount_cents integer NOT NULL, commission_percent integer NOT NULL DEFAULT 10,
    currency varchar NOT NULL DEFAULT 'USD', description text, period_month varchar NOT NULL,
    status varchar NOT NULL DEFAULT 'pending', created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS partner_applications (
    id serial PRIMARY KEY, company_name text NOT NULL, contact_name text NOT NULL,
    email varchar NOT NULL, phone varchar, country varchar NOT NULL,
    country_name varchar NOT NULL, city varchar, website text,
    current_customers integer DEFAULT 0, team_size integer DEFAULT 1,
    years_in_business integer DEFAULT 0, services_offered text, why_partner text,
    desired_tier varchar NOT NULL DEFAULT 'authorized', status varchar NOT NULL DEFAULT 'pending',
    review_notes text, reviewed_by varchar REFERENCES users(id), reviewed_at timestamp,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS partners (
    id serial PRIMARY KEY, user_id varchar REFERENCES users(id),
    application_id integer REFERENCES partner_applications(id),
    slug varchar NOT NULL UNIQUE, company_name text NOT NULL,
    country varchar NOT NULL, country_name varchar NOT NULL, city varchar,
    contact_name text NOT NULL, contact_email varchar NOT NULL, contact_phone varchar,
    website text, logo_url text, description text, services text[],
    tier varchar NOT NULL DEFAULT 'authorized', commission_percent integer NOT NULL DEFAULT 20,
    exclusive_country boolean NOT NULL DEFAULT false, status varchar NOT NULL DEFAULT 'active',
    approved_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, public_listed boolean NOT NULL DEFAULT true,
    total_customers integer NOT NULL DEFAULT 0, total_earned_cents integer NOT NULL DEFAULT 0,
    total_paid_cents integer NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS partner_customers (
    id serial PRIMARY KEY, partner_id integer NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    attributed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, first_paid_at timestamp,
    lifetime_value_cents integer NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS partner_commissions (
    id serial PRIMARY KEY, partner_id integer NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    partner_customer_id integer REFERENCES partner_customers(id) ON DELETE SET NULL,
    user_id varchar REFERENCES users(id) ON DELETE SET NULL, amount_cents integer NOT NULL,
    base_amount_cents integer NOT NULL, commission_percent integer NOT NULL,
    currency varchar NOT NULL DEFAULT 'USD', description text, period_month varchar,
    status varchar NOT NULL DEFAULT 'pending', payout_id integer,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS partner_leads (
    id serial PRIMARY KEY, partner_id integer REFERENCES partners(id) ON DELETE SET NULL,
    name text NOT NULL, email varchar NOT NULL, phone varchar, company text, country varchar,
    message text, source varchar DEFAULT 'contact_form', status varchar NOT NULL DEFAULT 'new',
    notes text, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS partner_payouts (
    id serial PRIMARY KEY, partner_id integer NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL, currency varchar NOT NULL DEFAULT 'USD',
    method varchar NOT NULL DEFAULT 'bank', reference text, status varchar NOT NULL DEFAULT 'pending',
    notes text, paid_at timestamp, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;
