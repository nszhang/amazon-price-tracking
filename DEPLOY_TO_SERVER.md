# Deploy to 192.168.89.55 with SSL (Port 443)

## Overview

This will deploy Amazon Price Tracker to share port 443 with your existing libgen.pnpsolutions.ca site using Nginx as a reverse proxy.

**Domain:** amazonpricetracker.pnpsolutions.ca  
**External Port:** 443 (HTTPS)  
**Internal Port:** 3000 (Next.js app)  
**SSL:** Let's Encrypt certificate

## Prerequisites

- DNS must point `amazonpricetracker.pnpsolutions.ca` to `192.168.89.55`
- Nginx should already be installed (since libgen is running)
- Sudo access on the server

## Deployment Steps

### Step 1: Copy Files to Server

From your local machine:

```bash
# Copy the application files
scp -i /home/nzhang/.ssh/id_ed25519 -r /home/nzhang/github/amazon-price-tracking nzhang@192.168.89.55:/home/nzhang/
```

### Step 2: SSH into Server

```bash
ssh -i /home/nzhang/.ssh/id_ed25519 nzhang@192.168.89.55
```

### Step 3: Run Deployment Script

On the server:

```bash
cd /home/nzhang/amazon-price-tracking
./deploy.sh
```

This will:
- ✅ Install PostgreSQL and Node.js (if missing)
- ✅ Create database and user
- ✅ Build and start the application on internal port 3000
- ✅ Set up systemd service
- ✅ Configure cron jobs

### Step 4: Configure Nginx and SSL

**Important:** This step requires DNS to be configured first!

Make sure `amazonpricetracker.pnpsolutions.ca` points to `192.168.89.55`, then run:

```bash
cd /home/nzhang/amazon-price-tracking
sudo ./setup-nginx-ssl.sh
```

This will:
- ✅ Create Nginx configuration
- ✅ Obtain SSL certificate from Let's Encrypt
- ✅ Configure HTTPS redirect
- ✅ Set up reverse proxy to port 3000

### Step 5: Verify Everything Works

```bash
# Check application is running
sudo systemctl status amazon-price-tracker

# Check Nginx configuration
sudo nginx -t

# Check SSL certificate
sudo certbot certificates

# Test the site
curl -I https://amazonpricetracker.pnpsolutions.ca
```

## Access Your Application

Once complete, access the app at:
**https://amazonpricetracker.pnpsolutions.ca**

## How It Works

```
Internet (Port 443)
    |
    v
Nginx (Port 443) - Routes based on domain name
    |                    |
    |                    |
    v                    v
libgen.pnpsolutions.ca   amazonpricetracker.pnpsolutions.ca
(Existing site)          (Port 3000 internally)
```

Both sites share port 443, but Nginx routes requests based on the `Host` header (domain name).

## Troubleshooting

### Site Returns 502 Bad Gateway

```bash
# Check if app is running
sudo systemctl status amazon-price-tracker

# Check app logs
sudo journalctl -u amazon-price-tracker -n 50

# Check if port 3000 is listening
sudo netstat -tulpn | grep 3000

# Restart app
sudo systemctl restart amazon-price-tracker
```

### SSL Certificate Issues

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Force renew
sudo certbot renew --force-renewal

# Check certificate details
sudo certbot certificates
```

### Nginx Errors

```bash
# Test configuration
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/amazon-price-tracker-error.log

# Check Nginx access logs
sudo tail -f /var/log/nginx/amazon-price-tracker-access.log

# Reload Nginx
sudo systemctl reload nginx
```

### Port Conflicts

If port 3000 is already in use:

```bash
# Find what's using port 3000
sudo lsof -i :3000

# Change internal port in .env.local
nano /home/nzhang/amazon-price-tracking/.env.local
# Change PORT=3000 to PORT=3001

# Update Nginx config to match
sudo nano /etc/nginx/sites-available/amazon-price-tracker
# Change proxy_pass to the new port

# Restart services
sudo systemctl restart amazon-price-tracker
sudo systemctl reload nginx
```

## Maintenance Commands

### View Application Logs
```bash
# Real-time logs
sudo journalctl -u amazon-price-tracker -f

# Last 100 lines
sudo journalctl -u amazon-price-tracker --no-pager -n 100
```

### Restart Application
```bash
sudo systemctl restart amazon-price-tracker
```

### Update Application
```bash
cd /home/nzhang/amazon-price-tracking

# Pull latest changes (if using git)
git pull

# Or copy new files from local machine
# Then rebuild:
npm run build

# Restart
sudo systemctl restart amazon-price-tracker
```

### Add Rainforest API

```bash
# Edit environment file
nano /home/nzhang/amazon-price-tracking/.env.local

# Add:
RAINFOREST_API_KEY=your-rainforest-api-key

# Restart
sudo systemctl restart amazon-price-tracker
```

### Add Email Notifications

```bash
# Edit environment file
nano /home/nzhang/amazon-price-tracking/.env.local

# Add:
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Restart
sudo systemctl restart amazon-price-tracker
```

## Nginx Configuration Details

The Nginx config creates:

1. **HTTP redirect** (port 80) → HTTPS (port 443)
2. **HTTPS server** (port 443) with:
   - SSL certificate
   - Security headers
   - Reverse proxy to port 3000
   - WebSocket support
   - Static file caching

### Manual Nginx Config (if needed)

If the script doesn't work, manually create:

```bash
sudo nano /etc/nginx/sites-available/amazon-price-tracker
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name amazonpricetracker.pnpsolutions.ca;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name amazonpricetracker.pnpsolutions.ca;

    ssl_certificate /etc/letsencrypt/live/amazonpricetracker.pnpsolutions.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/amazonpricetracker.pnpsolutions.ca/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then:
```bash
sudo ln -s /etc/nginx/sites-available/amazon-price-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d amazonpricetracker.pnpsolutions.ca
```

## Backup

Don't forget to backup:
1. Database: `sudo -u postgres pg_dump amazon_price_tracker > backup.sql`
2. Environment file: `/home/nzhang/amazon-price-tracking/.env.local`
3. Credentials file: `/home/nzhang/amazon-price-tracking/.deployment-credentials.txt`

## Security Notes

- Application runs as user `nzhang` (not root)
- Database password is automatically generated
- SSL certificate auto-renews via Certbot
- Internal port 3000 is not exposed externally (only accessible via Nginx)
- Environment variables are restricted to the service
