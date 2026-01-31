-- PostgreSQL Schema for Amazon Price Tracker (Self-Hosted)
-- Run this on your Ubuntu server after installing PostgreSQL

-- Create database
-- CREATE DATABASE amazon_price_tracker;

-- Connect to database and run:

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (replaces Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified TIMESTAMP WITH TIME ZONE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    alert_email VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'UTC',
    currency VARCHAR(10) DEFAULT 'USD',
    default_alert_threshold_percent INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table for NextAuth
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP WITH TIME ZONE NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verification tokens for email verification
CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Tracked items table
CREATE TABLE IF NOT EXISTS tracked_items (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asin VARCHAR(10) NOT NULL,
    isbn VARCHAR(13),
    amazon_url TEXT NOT NULL,
    amazon_domain VARCHAR(10) NOT NULL DEFAULT 'com',
    title VARCHAR(500) NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(255),
    image_url TEXT,
    current_price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    alert_threshold DECIMAL(10, 2) NOT NULL,
    alert_threshold_percent INTEGER,
    alert_enabled BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    first_tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    last_price_drop_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, asin)
);

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    in_stock BOOLEAN NOT NULL DEFAULT true,
    scrape_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Price alerts table
CREATE TABLE IF NOT EXISTS price_alerts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
    threshold_price DECIMAL(10, 2) NOT NULL,
    actual_price DECIMAL(10, 2) NOT NULL,
    price_drop_percent DECIMAL(5, 2),
    previous_price DECIMAL(10, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_sent_to VARCHAR(255),
    email_status VARCHAR(50),
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tracked_items_user_id ON tracked_items(user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_item_id ON price_history(item_id);
CREATE INDEX IF NOT EXISTS idx_price_history_scraped_at ON price_history(scraped_at);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_item_id ON price_alerts(item_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tracked_items_updated_at ON tracked_items;
CREATE TRIGGER update_tracked_items_updated_at
    BEFORE UPDATE ON tracked_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create price alert when price drops
CREATE OR REPLACE FUNCTION check_price_alert()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    price_drop_percent DECIMAL(5, 2);
BEGIN
    -- Get item details
    SELECT * INTO item_record FROM tracked_items WHERE id = NEW.item_id;
    
    IF item_record IS NULL OR NOT item_record.alert_enabled THEN
        RETURN NEW;
    END IF;

    -- Calculate price drop percentage if we have a previous price
    IF item_record.current_price > 0 AND item_record.current_price > NEW.price THEN
        price_drop_percent := ((item_record.current_price - NEW.price) / item_record.current_price) * 100;
        
        -- Check if price dropped below threshold
        IF NEW.price <= item_record.alert_threshold OR 
           (item_record.alert_threshold_percent IS NOT NULL AND 
            price_drop_percent >= item_record.alert_threshold_percent) THEN
            
            -- Create alert
            INSERT INTO price_alerts (
                user_id,
                item_id,
                threshold_price,
                actual_price,
                price_drop_percent,
                previous_price,
                status
            ) VALUES (
                item_record.user_id,
                NEW.item_id,
                item_record.alert_threshold,
                NEW.price,
                price_drop_percent,
                item_record.current_price,
                'active'
            );
            
            -- Update item's last_price_drop_at
            UPDATE tracked_items 
            SET last_price_drop_at = NOW()
            WHERE id = NEW.item_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for price alerts
DROP TRIGGER IF EXISTS price_alert_trigger ON price_history;
CREATE TRIGGER price_alert_trigger
    AFTER INSERT ON price_history
    FOR EACH ROW
    EXECUTE FUNCTION check_price_alert();

-- Function to update item's current price after price history insert
CREATE OR REPLACE FUNCTION update_item_current_price()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tracked_items 
    SET 
        current_price = NEW.price,
        last_checked_at = NEW.scraped_at
    WHERE id = NEW.item_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update current price
DROP TRIGGER IF EXISTS update_current_price_trigger ON price_history;
CREATE TRIGGER update_current_price_trigger
    AFTER INSERT ON price_history
    FOR EACH ROW
    EXECUTE FUNCTION update_item_current_price();
