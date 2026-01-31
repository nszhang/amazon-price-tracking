# Complete Guide: Apply for Amazon PA-API 5.0 (FREE)

## Overview

Amazon Product Advertising API 5.0 is **completely free** but requires you to:

1. Join the Amazon Associates program
2. Make 3 qualifying sales within 180 days
3. Apply for PA-API access
4. Set up API credentials

---

## Step 1: Sign Up for Amazon Associates Program

### 1.1 Create Your Account

1. Go to [https://affiliate-program.amazon.com/](https://affiliate-program.amazon.com/)
2. Click **"Sign up"** or **"Join Now for Free"**
3. Sign in with your existing Amazon account or create a new one

### 1.2 Complete Your Profile

You'll need to provide:

- **Website/App Information**: Your website URL, mobile app, or channel where you'll promote Amazon products
  - For your price tracker, use: `https://amazonpricetracker.pnpsolutions.ca`
- **Tax Information**: Complete the W-8BEN/W-9 form (required for payments)
- **Payment Details**: Bank account or gift card for commissions
- **Phone Verification**: Verify your phone number

### 1.3 Requirements Checklist

- [ ] Have a working website with content (your price tracker qualifies)
- [ ] Provide accurate tax information
- [ ] Agree to the [Associates Program Operating Agreement](https://affiliate-program.amazon.com/help/operating/agreement)
- [ ] Follow [Associates Program Policies](https://affiliate-program.amazon.com/help/operating/policies)

---

## Step 2: Qualify for PA-API Access

### 2.1 Make 3 Qualifying Sales

To get PA-API access, you must generate **3 qualifying sales within 180 days** of joining.

**What counts as a qualifying sale:**
- A customer clicks your affiliate link AND
- Makes a purchase within 24 hours AND
- The product is shipped AND
- The sale isn't returned/refunded

**Tips to get your 3 sales quickly:**

1. **Use your own site** - Make small purchases through your own affiliate links
2. **Share with friends/family** - Ask them to buy through your links
3. **Add affiliate links to your price tracker** - When users click "View on Amazon", use your affiliate tag
4. **Create content** - Write reviews or comparisons with your links

---

## Step 3: Apply for PA-API Access

Once you have 3 qualifying sales:

### 3.1 Navigate to PA-API Registration

1. **Sign in** to your Amazon Associates account: [https://affiliate-program.amazon.com/](https://affiliate-program.amazon.com/)
2. Go to **Tools** → **Product Advertising API**
3. Click **"Apply for PA-API access"** or similar button

### 3.2 Fill Out the Application

You'll need to provide:

- **Your use case**: Explain you're building a price tracking application
- **Expected request volume**: Be honest (e.g., "100-500 requests per day")
- **Your website URL**: `https://amazonpricetracker.pnpsolutions.ca`
- **Technical details**: You're using Node.js/Next.js

### 3.3 Wait for Approval

- Approval typically takes **1-7 business days**
- You'll receive an email when approved

---

## Step 4: Create API Credentials

Once approved for PA-API access:

### 4.1 Create Your AWS Account (if you don't have one)

1. Go to [https://aws.amazon.com/](https://aws.amazon.com/)
2. Click **"Create an AWS Account"**
3. Use the same email as your Associates account (recommended)
4. **AWS Free Tier is sufficient** - you don't need to pay anything

### 4.2 Generate Access Keys

**Option A: Through AWS (Recommended)**

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Click your account name → **"Security Credentials"**
3. Expand **"Access keys"** section
4. Click **"Create access key"**
5. Save both keys securely:
   - **Access Key ID** (20 characters)
   - **Secret Access Key** (40 characters)

**Option B: Through Associates Portal**

1. Go to Associates → **Tools** → **Product Advertising API**
2. Look for **"Manage your credentials"**
3. Create or view your keys

### 4.3 Get Your Partner Tag (Associate ID)

1. In your Associates account, go to **"Account Settings"**
2. Find your **"Tracking ID"** or **"Associate ID"**
3. This is your **Partner Tag** (looks like: `yourtag-20`)

---

## Step 5: Configure Environment Variables

Add these to your `.env.local` file:

```bash
# Amazon PA-API 5.0 Credentials
PAAPI_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
PAAPI_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
PAAPI_PARTNER_TAG=yourtag-20

# API Endpoints (based on your marketplace)
PAAPI_HOST=webservices.amazon.com
PAAPI_REGION=us-east-1

# For Amazon.ca, use:
# PAAPI_HOST=webservices.amazon.ca
# PAAPI_REGION=us-east-1  # Note: CA uses us-east-1 region
```

### Host and Region by Marketplace

| Marketplace | Host | Region |
|------------|------|--------|
| Amazon.com (US) | webservices.amazon.com | us-east-1 |
| Amazon.ca (CA) | webservices.amazon.ca | us-east-1 |
| Amazon.co.uk (UK) | webservices.amazon.co.uk | eu-west-1 |
| Amazon.de (DE) | webservices.amazon.de | eu-west-1 |

---

## Step 6: Install PA-API SDK

```bash
npm install amazon-product-api
# or
npm install @paapi-sdk/paapi-sdk
```

---

## Important PA-API 5.0 Limitations

| Limitation | Details |
|------------|---------|
| **Rate Limit** | 1 request/second (up to 10 with sales volume) |
| **Daily Limit** | 8,640 requests/day (1 req/hr × 24 hr × 360 days ÷ 1000) |
| **Request Types** | Product lookup, search, variations, cart operations |
| **Affiliate Required** | Must use your Partner Tag in all requests |
| **Data Availability** | Not all products have PA-API data |

---

## Useful Resources

- [Official PA-API 5.0 Documentation](https://webservices.amazon.com/paapi5/documentation/)
- [PA-API Registration Guide](https://webservices.amazon.com/paapi5/documentation/register-for-pa-api.html)
- [PA-API Rate Limits](https://webservices.amazon.com/paapi5/documentation/troubleshooting/api-rates.html)
- [Associates Program Policies](https://affiliate-program.amazon.com/help/operating/policies)

---

## Quick Start Checklist

- [ ] Sign up for Amazon Associates
- [ ] Complete profile with website/tax/payment info
- [ ] Make 3 qualifying sales (can use own affiliate links)
- [ ] Apply for PA-API access in Associates portal
- [ ] Create AWS account and generate access keys
- [ ] Get Partner Tag from Associates account
- [ ] Configure environment variables
- [ ] Install PA-API SDK
- [ ] Test API call

---

## Next Steps

Once you have your PA-API credentials:

1. Add credentials to your `.env.local` file
2. The application can be configured to use PA-API for product data instead of scraping
3. PA-API is more reliable and won't be blocked by Amazon's anti-scraping measures

### Benefits of PA-API

- **Completely free** - No API costs
- **Official data source** - Direct from Amazon
- **More reliable** - No CAPTCHAs or IP blocks
- **Legal** - Terms of service compliant
- **Faster** - No HTML parsing needed
