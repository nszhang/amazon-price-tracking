-- Add consecutive_captchas column for batch-based scraping
-- Tracks how many consecutive CAPTCHAs an item has received
-- Items with >= 3 are deprioritized in the batch queue

ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS consecutive_captchas INTEGER DEFAULT 0;
