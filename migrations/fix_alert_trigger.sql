-- Migration: Fix alert trigger to fire when price is below threshold
-- Run this on your server to update the trigger function

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

    -- Calculate price drop percentage if we have a previous price that's higher
    IF item_record.current_price > 0 AND item_record.current_price > NEW.price THEN
        price_drop_percent := ((item_record.current_price - NEW.price) / item_record.current_price) * 100;
    ELSE
        price_drop_percent := 0;
    END IF;

    -- Check if price dropped below threshold OR price is already at/below threshold
    IF NEW.price <= item_record.alert_threshold OR
       (price_drop_percent > 0 AND item_record.alert_threshold_percent IS NOT NULL AND
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
