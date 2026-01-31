#!/bin/bash
# Price Alert Processing Script
# Run this script via cron to process price alerts
# Usage: ./process-alerts.sh

# Configuration
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-your-cron-secret}"

# Run the alert processing endpoint
curl -X POST "${APP_URL}/api/cron/process-alerts" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -s

# Log the execution
echo "[$(date)] Price alert processing completed"
