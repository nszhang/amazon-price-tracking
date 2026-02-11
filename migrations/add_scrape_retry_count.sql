-- Add scrape_retry_count column for tracking retry attempts on "Loading..." items
-- Items that fail to scrape after max retries will be deleted

ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS scrape_retry_count INTEGER DEFAULT 0;
