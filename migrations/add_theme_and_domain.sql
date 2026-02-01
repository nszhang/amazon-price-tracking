-- Migration: Add theme and default_amazon_domain to users table
-- Run this on your server to add the new columns

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'system';
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_amazon_domain VARCHAR(10) DEFAULT 'com';
