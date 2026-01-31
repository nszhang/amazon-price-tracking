#!/bin/bash
# Nginx Configuration Script for Amazon Price Tracker
# Sets up reverse proxy with SSL for amazonpricetracker.pnpsolutions.ca

set -e

echo "=========================================="
echo "Nginx SSL Configuration Script"
echo "=========================================="
echo ""

APP_DIR="/home/nzhang/amazon-price-tracking"
DOMAIN="amazonpricetracker.pnpsolutions.ca"
INTERNAL_PORT="3000"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   print_error "This script must be run with sudo"
   exit 1
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    apt update
    apt install -y nginx
fi

# Check if Certbot is installed
if ! command -v certbot &> /dev/null; then
    print_status "Installing Certbot..."
    apt install -y certbot python3-certbot-nginx
fi

# Create Nginx configuration
print_status "Creating Nginx configuration for $DOMAIN..."

cat > /etc/nginx/sites-available/amazon-price-tracker << 'EOF'
server {
    listen 80;
    server_name amazonpricetracker.pnpsolutions.ca;
    
    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name amazonpricetracker.pnpsolutions.ca;

    # SSL Configuration (Certbot will fill these in)
    # ssl_certificate /etc/letsencrypt/live/amazonpricetracker.pnpsolutions.ca/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/amazonpricetracker.pnpsolutions.ca/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/amazon-price-tracker-access.log;
    error_log /var/log/nginx/amazon-price-tracker-error.log;

    # Proxy to Next.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket support (for Next.js dev mode, optional)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        
        proxy_cache_bypass $http_upgrade;
    }

    # Static file caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint (optional)
    location /api/health {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOF

# Enable the site
print_status "Enabling Nginx site..."
if [ -f "/etc/nginx/sites-enabled/amazon-price-tracker" ]; then
    rm /etc/nginx/sites-enabled/amazon-price-tracker
fi
ln -s /etc/nginx/sites-available/amazon-price-tracker /etc/nginx/sites-enabled/

# Test Nginx configuration
print_status "Testing Nginx configuration..."
nginx -t

# Reload Nginx
print_status "Reloading Nginx..."
systemctl reload nginx

# Obtain SSL certificate
print_status "Obtaining SSL certificate for $DOMAIN..."
print_warning "Make sure DNS is configured to point $DOMAIN to this server (192.168.89.55)"
read -p "Is DNS configured? (y/N): " dns_ready

if [[ $dns_ready =~ ^[Yy]$ ]]; then
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@pnpsolutions.ca
    
    if [ $? -eq 0 ]; then
        print_status "SSL certificate obtained successfully!"
    else
        print_error "Failed to obtain SSL certificate"
        print_status "You can try manually later with: sudo certbot --nginx -d $DOMAIN"
    fi
else
    print_warning "Skipping SSL certificate setup"
    print_status "Run this later when DNS is ready:"
    print_status "  sudo certbot --nginx -d $DOMAIN"
fi

# Update application environment
print_status "Updating application configuration..."
su - nzhang -c "cd $APP_DIR && sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN|' .env.local"

# Restart the application
print_status "Restarting application..."
systemctl restart amazon-price-tracker

# Wait and check
sleep 3
if systemctl is-active --quiet amazon-price-tracker; then
    print_status "Application is running"
else
    print_error "Application failed to start"
    journalctl -u amazon-price-tracker --no-pager -n 20
fi

# Final status
echo ""
echo "=========================================="
echo -e "${GREEN}NGINX CONFIGURATION COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Site URL: https://$DOMAIN"
echo ""
echo "Nginx Commands:"
echo "  sudo nginx -t                    - Test configuration"
echo "  sudo systemctl reload nginx      - Reload Nginx"
echo "  sudo systemctl status nginx      - Check Nginx status"
echo ""
echo "SSL Certificate:"
echo "  sudo certbot certificates        - View certificates"
echo "  sudo certbot renew --dry-run     - Test renewal"
echo ""
echo "Logs:"
echo "  /var/log/nginx/amazon-price-tracker-access.log"
echo "  /var/log/nginx/amazon-price-tracker-error.log"
echo ""
echo "=========================================="
