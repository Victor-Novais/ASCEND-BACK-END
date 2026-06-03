-- Migration: add_pdti_full_fields
-- Aplicar no Supabase SQL Editor: Dashboard → SQL Editor → New query

ALTER TABLE "PDTI"
  ADD COLUMN IF NOT EXISTS "values"            TEXT,
  ADD COLUMN IF NOT EXISTS "legalRequirements" TEXT,
  ADD COLUMN IF NOT EXISTS "currentScenario"   TEXT,
  ADD COLUMN IF NOT EXISTS "desiredScenario"   TEXT,
  ADD COLUMN IF NOT EXISTS "period"            TEXT,
  ADD COLUMN IF NOT EXISTS "responsible"       TEXT,
  ADD COLUMN IF NOT EXISTS "swotStrengths"     TEXT,
  ADD COLUMN IF NOT EXISTS "swotWeaknesses"    TEXT,
  ADD COLUMN IF NOT EXISTS "swotOpportunities" TEXT,
  ADD COLUMN IF NOT EXISTS "swotThreats"       TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"        TEXT;
