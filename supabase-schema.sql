-- Amazon Price Tracking - Database Schema
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- =============================================
-- Custom Types
-- =============================================

CREATE TYPE amazon_domain AS ENUM ('com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp');
CREATE TYPE alert_status AS ENUM ('active', 'triggered', 'disabled');
CREATE TYPE scrape_status AS ENUM ('pending', 'success', 'failed', 'rate_limited');

-- =============================================
-- Profiles Table (extends auth.users)
-- =============================================

CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    alert_email TEXT, -- Optional: different from account email
    timezone TEXT DEFAULT 'UTC',
    preferences JSONB DEFAULT '{"currency": "USD", "default_alert_threshold_percent": 10}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================
-- Tracked Items Table
-- =============================================

CREATE TABLE tracked_items (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Product identifiers
    asin VARCHAR(20) UNIQUE NOT NULL,
    isbn VARCHAR(20),
    amazon_url TEXT NOT NULL,
    amazon_domain amazon_domain DEFAULT 'com',

    -- Product information (updated periodically)
    title TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    image_url TEXT,
    current_price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',

    -- Tracking settings
    alert_threshold DECIMAL(10, 2) NOT NULL, -- Absolute price threshold
    alert_threshold_percent DECIMAL(5, 2), -- Optional percentage threshold
    alert_enabled BOOLEAN DEFAULT true,
    notes TEXT,

    -- Timestamps
    first_tracked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_checked_at TIMESTAMPTZ,
    last_price_drop_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT valid_threshold CHECK (alert_threshold >= 0),
    CONSTRAINT valid_percent CHECK (alert_threshold_percent IS NULL OR (alert_threshold_percent >= 0 AND alert_threshold_percent <= 100))
);

-- =============================================
-- Price History Table
-- =============================================

CREATE TABLE price_history (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT REFERENCES tracked_items(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    in_stock BOOLEAN DEFAULT true,
    scrape_status scrape_status DEFAULT 'success',
    error_message TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT valid_price CHECK (price >= 0)
);

-- =============================================
-- Price Alerts Table
-- =============================================

CREATE TABLE price_alerts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES tracked_items(id) ON DELETE CASCADE,

    -- Alert details
    threshold_price DECIMAL(10, 2) NOT NULL,
    actual_price DECIMAL(10, 2) NOT NULL,
    price_drop_percent DECIMAL(5, 2),
    previous_price DECIMAL(10, 2),

    -- Alert status
    status alert_status DEFAULT 'active',
    email_sent_at TIMESTAMPTZ,
    email_sent_to TEXT,
    email_status VARCHAR(50), -- 'pending', 'sent', 'failed'

    -- Timestamps
    triggered_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================
-- Indexes for Performance
-- =============================================

-- Tracked items indexes
CREATE INDEX idx_tracked_items_user_id ON tracked_items(user_id);
CREATE INDEX idx_tracked_items_asin ON tracked_items(asin);
CREATE INDEX idx_tracked_items_last_checked ON tracked_items(last_checked_at);
CREATE INDEX idx_tracked_items_alert_enabled ON tracked_items(user_id, alert_enabled) WHERE alert_enabled = true;

-- Price history indexes
CREATE INDEX idx_price_history_item_id ON price_history(item_id);
CREATE INDEX idx_price_history_scraped_at ON price_history(scraped_at DESC);
CREATE INDEX idx_price_history_item_scraped ON price_history(item_id, scraped_at DESC);

-- Price alerts indexes
CREATE INDEX idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX idx_price_alerts_status ON price_alerts(user_id, status);
CREATE INDEX idx_price_alerts_triggered_at ON price_alerts(triggered_at DESC);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Tracked items policies
CREATE POLICY "Users can view their own items"
    ON tracked_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items"
    ON tracked_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items"
    ON tracked_items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items"
    ON tracked_items FOR DELETE
    USING (auth.uid() = user_id);

-- Price history policies
CREATE POLICY "Users can view their own price history"
    ON price_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tracked_items
            WHERE tracked_items.id = price_history.item_id
            AND tracked_items.user_id = auth.uid()
        )
    );

-- Price alerts policies
CREATE POLICY "Users can view their own alerts"
    ON price_alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
    ON price_alerts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
    ON price_alerts FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================
-- Functions and Triggers
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracked_items_updated_at
    BEFORE UPDATE ON tracked_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Function to check and create price alerts
CREATE OR REPLACE FUNCTION check_price_alert()
RETURNS TRIGGER AS $$
DECLARE
    threshold DECIMAL(10, 2);
    drop_percent DECIMAL(5, 2);
    prev_price DECIMAL(10, 2);
    item_user_id UUID;
BEGIN
    -- Get item's alert threshold and user_id
    SELECT alert_threshold, user_id INTO threshold, item_user_id
    FROM tracked_items
    WHERE id = NEW.item_id;

    -- Check if price dropped below threshold
    IF NEW.price <= threshold AND NEW.scrape_status = 'success' THEN
        -- Calculate price drop percentage
        SELECT price INTO prev_price
        FROM price_history
        WHERE item_id = NEW.item_id AND price > NEW.price
        ORDER BY scraped_at DESC
        LIMIT 1;

        IF prev_price IS NOT NULL THEN
            drop_percent := ((prev_price - NEW.price) / prev_price) * 100;
        END IF;

        -- Create price alert
        INSERT INTO price_alerts (
            user_id, item_id, threshold_price, actual_price,
            price_drop_percent, previous_price, status
        )
        VALUES (
            item_user_id, NEW.item_id, threshold, NEW.price,
            drop_percent, prev_price, 'active'
        );

        -- Update last_price_drop_at
        UPDATE tracked_items
        SET last_price_drop_at = NEW.scraped_at
        WHERE id = NEW.item_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic alert creation
CREATE TRIGGER check_price_alert_trigger
    AFTER INSERT ON price_history
    FOR EACH ROW
    EXECUTE FUNCTION check_price_alert();

-- =============================================
-- Completed!
-- =============================================

-- Verify setup
SELECT 'Database schema created successfully!' as status;
SELECT COUNT(*) as profiles_count FROM profiles;
SELECT COUNT(*) as tracked_items_count FROM tracked_items;
SELECT COUNT(*) as price_history_count FROM price_history;
SELECT COUNT(*) as price_alerts_count FROM price_alerts;
