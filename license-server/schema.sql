-- Execute once on a new, dedicated Neon/Render Postgres database.
CREATE TABLE IF NOT EXISTS clippah_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  email text,
  status text NOT NULL CHECK (status IN ('active','suspended','revoked')) DEFAULT 'active',
  tier text NOT NULL CHECK (tier IN ('pro')) DEFAULT 'pro',
  seat_limit int NOT NULL DEFAULT 2 CHECK (seat_limit BETWEEN 1 AND 20),
  expires_at timestamptz,
  stripe_session_id text UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clippah_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES clippah_licenses(id) ON DELETE CASCADE,
  installation_hash char(64) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id,installation_hash)
);
CREATE INDEX IF NOT EXISTS clippah_activations_license ON clippah_activations(license_id);
CREATE TABLE IF NOT EXISTS clippah_stripe_events (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
