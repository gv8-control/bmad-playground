-- Add sandbox state columns to Conversation for restart-safe status recovery (Story 3.12).
-- Nullable so existing rows are not rejected; populated on every sandbox state transition.
ALTER TABLE "conversations" ADD COLUMN "sandbox_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN "sandbox_status" TEXT;
