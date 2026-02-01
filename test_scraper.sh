#!/bin/bash

# Test scraper endpoint with ASIN B0BMF7PJ4X
ASIN="B0BMF7PJ4X"
DOMAIN="ca"
URL="https://www.amazon.ca/dp/B0BMF7PJ4X"
USER_EMAIL="nszhang@gmail.com"
USER_PASSWORD="password123"

# Get authentication tokens
echo "Getting authentication tokens..."
LOGIN_RESPONSE=$(curl -s -c /tmp/cookies.txt -X POST http://192.168.89.55:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=auto&email=$USER_EMAIL&password=$USER_PASSWORD")

echo "Login response: $LOGIN_RESPONSE"

# Set session cookie
SESSION_COOKIE=$(grep -E "next-auth.session-token" /tmp/cookies.txt | awk '{print $7}')

echo "Session cookie: $SESSION_COOKIE"

# Test scraper endpoint
echo "Testing scraper with ASIN $ASIN..."
SCRAPE_RESPONSE=$(curl -s -b /tmp/cookies.txt -X POST http://192.168.89.55:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$URL\", \"asin\": \"$ASIN\", \"domain\": \"$DOMAIN\"}")

echo "Scrape response: $SCRAPE_RESPONSE"

# Extract price from response
EXTRACTED_PRICE=$(echo "$SCRAPE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'product' in data and 'price' in data['product']:
        print(f\"Extracted price: {data['product']['price']}\")
        print(f\"Currency: {data['product']['currency']}\")
        print(f\"In stock: {data['product']['inStock']}\")
    else:
        print(\"Error: No product or price found in response\")
        print(\"Full response:\", data)
except json.JSONDecodeError:
    print(\"Error: Invalid JSON response from server\")
    print(\"Response:\", sys.stdin.read())
")

echo "$EXTRACTED_PRICE"