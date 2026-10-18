import { pool } from "../db";

/** Additive setup: legacy applications, referrals and commissions remain intact. */
export async function prepareProgrammes() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS programme_applications (
      programme text NOT NULL CHECK(programme IN ('affiliate','business')),
      application_id integer NOT NULL,
      owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
      payout_method text CHECK(payout_method IN ('bank','mobile_money')),
      registration_number varchar(150),
      registration_country varchar(100),
      registration_verified boolean NOT NULL DEFAULT false,
      review_notes text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(programme,application_id)
    );
    CREATE TABLE IF NOT EXISTS programme_members (
      id bigserial PRIMARY KEY, programme text NOT NULL DEFAULT 'business' CHECK(programme='business'),
      application_id integer NOT NULL, user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK(role IN ('admin','sales','finance')),
      status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(programme,application_id) REFERENCES programme_applications ON DELETE CASCADE,
      UNIQUE(application_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS programme_invitations (
      id bigserial PRIMARY KEY, programme text NOT NULL DEFAULT 'business' CHECK(programme='business'),
      application_id integer NOT NULL, email varchar(254) NOT NULL,
      role text NOT NULL CHECK(role IN ('admin','sales','finance')),
      token_hash text NOT NULL UNIQUE, invited_by varchar NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked','expired')),
      expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(programme,application_id) REFERENCES programme_applications ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS programme_pending_invite
      ON programme_invitations(application_id,lower(email)) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS programme_events (
      id bigserial PRIMARY KEY, programme text NOT NULL, application_id integer NOT NULL,
      actor_id varchar, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS programme_mail_jobs (
      id bigserial PRIMARY KEY, programme text NOT NULL, application_id integer NOT NULL,
      event_key text NOT NULL UNIQUE, recipient varchar(254) NOT NULL,
      subject text NOT NULL, encrypted_payload text NOT NULL,
      state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','uncertain')),
      attempted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS programme_manual_payouts (
      id bigserial PRIMARY KEY, programme text NOT NULL, application_id integer NOT NULL,
      amount_cents bigint NOT NULL CHECK(amount_cents>0), currency varchar(3) NOT NULL,
      method text NOT NULL CHECK(method IN ('bank','mobile_money')),
      reference varchar(150) NOT NULL, recorded_by varchar NOT NULL,
      status text NOT NULL DEFAULT 'paid' CHECK(status='paid'),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS programme_payout_commissions (
      programme text NOT NULL, commission_id integer NOT NULL,
      payout_id bigint NOT NULL REFERENCES programme_manual_payouts(id),
      PRIMARY KEY(programme,commission_id)
    );
    CREATE TABLE IF NOT EXISTS programme_commission_reversals (
      programme text NOT NULL, commission_id integer NOT NULL, application_id integer NOT NULL,
      reason text NOT NULL, recorded_by varchar NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(programme,commission_id)
    );
    ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS payment_id integer;
    ALTER TABLE partner_commissions ADD COLUMN IF NOT EXISTS payment_id integer;
    ALTER TABLE partner_leads ADD COLUMN IF NOT EXISTS assigned_user_id varchar;
    ALTER TABLE programme_applications ADD COLUMN IF NOT EXISTS clicks bigint NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS programme_affiliate_payment
      ON affiliate_commissions(payment_id) WHERE payment_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS programme_business_payment
      ON partner_commissions(payment_id) WHERE payment_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS programme_commission_payments (
      payment_id integer PRIMARY KEY, programme text NOT NULL,
      beneficiary_id integer NOT NULL, commission_id integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS programme_migrations(name text PRIMARY KEY);
    DO $migration$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM programme_migrations WHERE name='legacy-commission-cutover') THEN
        INSERT INTO programme_commission_payments(payment_id,programme,beneficiary_id)
          SELECT id,'legacy',0 FROM payments WHERE status='completed' ON CONFLICT DO NOTHING;
        INSERT INTO programme_migrations VALUES('legacy-commission-cutover') ON CONFLICT DO NOTHING;
      END IF;
    END $migration$;
    CREATE INDEX IF NOT EXISTS programme_mail_queue ON programme_mail_jobs(state,created_at);
    CREATE INDEX IF NOT EXISTS programme_owner ON programme_applications(owner_user_id);
    CREATE INDEX IF NOT EXISTS programme_member_user ON programme_members(user_id,status);
    CREATE INDEX IF NOT EXISTS programme_events_application ON programme_events(programme,application_id,created_at);
  `);
}
