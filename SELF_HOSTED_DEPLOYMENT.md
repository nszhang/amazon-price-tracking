# Self-Hosted Deployment Guide

Deploy Amazon Price Tracker on your own Ubuntu Linux server without Supabase or Vercel.

## Prerequisites

- Ubuntu 20.04+ server with internet access
- Domain name (optional, for HTTPS)
- Root or sudo access

## Installation Steps

### 1. Install PostgreSQL

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE amazon_price_tracker;
CREATE USER price_tracker_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE amazon_price_tracker TO price_tracker_user;
\c amazon_price_tracker
GRANT ALL ON SCHEMA public TO price_tracker_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO price_tracker_user;
EOF
```

### 2. Install Node.js

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x.x
npm --version
```

### 3. Create Application User

```bash
# Create a dedicated user for the application
sudo useradd -r -s /bin/false price-tracker
sudo mkdir -p /opt/amazon-price-tracking
sudo chown price-tracker:price-tracker /opt/amazon-price-tracking
```

### 4. Deploy Application

```bash
# Copy your application files
cd /opt/amazon-price-tracking
sudo -u price-tracker git clone <your-repo-url> .  # or copy files directly

# Install dependencies
sudo -u price-tracker npm install --legacy-peer-deps

# Build the application
sudo -u price-tracker npm run build
```

### 5. Set Up Database Schema

```bash
# Run the database schema
sudo -u postgres psql -d amazon_price_tracker -f database-schema.sql
```

### 6. Configure Environment Variables

```bash
# Create environment file
sudo tee /opt/amazon-price-tracking/.env.local <<EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amazon_price_tracker
DB_USER=price_tracker_user
DB_PASSWORD=your-secure-password

# NextAuth Configuration
NEXTAUTH_URL=http://your-server-ip:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Optional: Rainforest API (for reliable scraping)
RAINFOREST_API_KEY=your-rainforest-api-key

# Optional: Email Service (Resend)
RESEND_API_KEY=your-resend-api-key

# Optional: Cron Job Security
CRON_SECRET=$(openssl rand -base64 32)
EOF

sudo chown price-tracker:price-tracker /opt/amazon-price-tracking/.env.local
sudo chmod 600 /opt/amazon-price-tracking/.env.local
```

### 7. Install Systemd Service

```bash
# Copy service file
sudo cp amazon-price-tracker.service /etc/systemd/system/

# Edit the service file with your configuration
sudo nano /etc/systemd/system/amazon-price-tracker.service

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable amazon-price-tracker
sudo systemctl start amazon-price-tracker

# Check status
sudo systemctl status amazon-price-tracker
```

### 8. Set Up Cron Jobs

```bash
# Edit crontab for price-tracker user
sudo -u price-tracker crontab -e

# Add this line to run every 6 hours
0 */6 * * * /opt/amazon-price-tracking/scripts/process-alerts.sh >> /var/log/price-tracker-cron.log 2>&1
```

### 9. Configure Firewall (if needed)

```bash
# Allow port 3000 (or configure nginx reverse proxy)
sudo ufw allow 3000/tcp

# Or for nginx reverse proxy
sudo ufw allow 'Nginx Full'
```

### 10. Set Up Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install nginx
sudo apt install -y nginx

# Create nginx config
sudo tee /etc/nginx/sites-available/amazon-price-tracker <<EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/amazon-price-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Set up HTTPS with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Environment Variables Reference

### Required
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `NEXTAUTH_URL` - Your app URL (e.g., http://localhost:3000)
- `NEXTAUTH_SECRET` - Random secret for JWT (generate with `openssl rand -base64 32`)

### Optional
- `RAINFOREST_API_KEY` - For using Rainforest API instead of scraping
- `RESEND_API_KEY` - For email notifications
- `CRON_SECRET` - Secret for securing cron endpoints

## Managing the Application

### View Logs
```bash
# Application logs
sudo journalctl -u amazon-price-tracker -f

# Cron job logs
sudo tail -f /var/log/price-tracker-cron.log
```

### Restart Service
```bash
sudo systemctl restart amazon-price-tracker
```

### Update Application
```bash
cd /opt/amazon-price-tracking
sudo -u price-tracker git pull
sudo -u price-tracker npm install --legacy-peer-deps
sudo -u price-tracker npm run build
sudo systemctl restart amazon-price-tracker
```

## Troubleshooting

### Database Connection Issues
```bash
# Test database connection
sudo -u price-tracker psql -h localhost -U price_tracker_user -d amazon_price_tracker

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Application Won't Start
```bash
# Check for errors
sudo journalctl -u amazon-price-tracker -n 50

# Check if port is in use
sudo netstat -tulpn | grep 3000
```

### Build Errors
```bash
# Clear Next.js cache
sudo -u price-tracker rm -rf .next
sudo -u price-tracker npm run build
```

## Backup and Restore

### Backup Database
```bash
# Create backup
sudo -u postgres pg_dump amazon_price_tracker > backup-$(date +%Y%m%d).sql

# Compress backup
gzip backup-$(date +%Y%m%d).sql
```

### Restore Database
```bash
# Restore from backup
gunzip backup-YYYYMMDD.sql.gz
sudo -u postgres psql amazon_price_tracker < backup-YYYYMMDD.sql
```

## Security Considerations

1. **Change default passwords** - Use strong, unique passwords
2. **Enable firewall** - Only expose necessary ports
3. **Use HTTPS** - Set up SSL certificate with Let's Encrypt
4. **Keep system updated** - Regular security updates
5. **Database security** - Don't expose PostgreSQL port externally
6. **Secrets management** - Keep .env.local secure with restricted permissions

## Architecture Changes from Supabase/Vercel

### What Changed

1. **Authentication**: Supabase Auth → NextAuth.js with local PostgreSQL
2. **Database**: Supabase PostgreSQL → Local PostgreSQL with raw queries
3. **Hosting**: Vercel → Systemd service on Ubuntu
4. **Cron Jobs**: Vercel Cron → Linux cron + shell script
5. **Row Level Security**: Removed (replaced with application-level checks)

### Benefits of Self-Hosting

- ✅ Full control over data
- ✅ No third-party dependencies
- ✅ Lower long-term costs (no SaaS fees)
- ✅ Works offline/air-gapped
- ✅ Customizable to your needs

### Trade-offs

- ⚠️ You manage infrastructure
- ⚠️ Manual backups required
- ⚠️ No automatic scaling
- ⚠️ Security is your responsibility

## Next Steps

1. Configure email notifications (optional)
2. Set up Rainforest API for reliable scraping (optional)
3. Configure automated backups
4. Monitor application logs
5. Create additional admin users directly in database if needed
