#!/bin/bash
# Amazon Price Tracker Deployment Script with Nginx Support
# Run this on the server after copying the application files

set -e

echo "=========================================="
echo "Amazon Price Tracker - Deployment Script"
echo "=========================================="
echo ""

# Configuration
APP_DIR="/home/nzhang/amazon-price-tracking"
PORT="3000"  # Internal port, Nginx will proxy from 443
DB_NAME="amazon_price_tracker"
DB_USER="price_tracker_user"
DOMAIN="amazonpricetracker.pnpsolutions.ca"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
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
if [ "$EUID" -eq 0 ]; then 
   print_error "Please run as regular user (not root), sudo will be used when needed"
   exit 1
fi

# Navigate to app directory
cd $APP_DIR

# 1. Install PostgreSQL if not present
print_status "Checking PostgreSQL installation..."
if ! command -v psql &> /dev/null; then
    print_status "Installing PostgreSQL..."
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    print_status "PostgreSQL installed and started"
else
    print_status "PostgreSQL is already installed"
fi

# 2. Install Node.js if not present
print_status "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed: $(node --version)"
else
    NODE_VERSION=$(node --version)
    print_status "Node.js is already installed: $NODE_VERSION"
fi

# 3. Setup Database
print_status "Setting up database..."

# Generate secure password
DB_PASSWORD=$(openssl rand -base64 24)

# Check if database already exists
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    print_warning "Database '$DB_NAME' already exists"
    read -p "Do you want to reset the database? (y/N): " reset_db
    if [[ $reset_db =~ ^[Yy]$ ]]; then
        print_status "Dropping existing database..."
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;"
        DB_EXISTS="0"
    fi
fi

if [ "$DB_EXISTS" != "1" ]; then
    print_status "Creating database and user..."
    sudo -u postgres psql <<EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
EOF
    print_status "Database created successfully"
else
    print_status "Using existing database"
    # Try to get existing password from .env.local if it exists
    if [ -f ".env.local" ]; then
        DB_PASSWORD=$(grep DB_PASSWORD .env.local | cut -d '=' -f2)
        print_status "Using existing database password from .env.local"
    else
        print_error "Cannot find existing database password. Please check .env.local or reset the database."
        exit 1
    fi
fi

# 4. Run database schema
print_status "Running database schema..."
if [ -f "database-schema.sql" ]; then
    sudo -u postgres psql -d $DB_NAME -f database-schema.sql
    print_status "Database schema applied"
else
    print_error "database-schema.sql not found!"
    exit 1
fi

# 5. Install dependencies
print_status "Installing Node.js dependencies..."
npm install --legacy-peer-deps
print_status "Dependencies installed"

# 6. Generate secrets
print_status "Generating secrets..."
NEXTAUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -base64 32)

# 7. Create environment file
print_status "Creating environment configuration..."

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    print_warning ".env.local already exists"
    read -p "Do you want to overwrite it? (y/N): " overwrite_env
    if [[ ! $overwrite_env =~ ^[Yy]$ ]]; then
        print_status "Keeping existing .env.local"
        # Extract existing values
        DB_PASSWORD=$(grep DB_PASSWORD .env.local | cut -d '=' -f2 || echo "$DB_PASSWORD")
        NEXTAUTH_SECRET=$(grep NEXTAUTH_SECRET .env.local | cut -d '=' -f2 || echo "$NEXTAUTH_SECRET")
        CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f2 || echo "$CRON_SECRET")
    fi
fi

cat > .env.local << EOF
# ============================================
# Database Configuration
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# ============================================
# NextAuth Configuration
# ============================================
# This will be the public URL (HTTPS through Nginx)
NEXTAUTH_URL=https://$DOMAIN
NEXTAUTH_SECRET=$NEXTAUTH_SECRET

# ============================================
# Application Port (Internal only, Nginx proxies to this)
# ============================================
PORT=$PORT

# ============================================
# Optional: Rainforest API (for reliable scraping)
# Get API key from: https://www.rainforestapi.com
# ============================================
RAINFOREST_API_KEY=

# ============================================
# Optional: Email Service (Resend)
# Get API key from: https://resend.com
# ============================================
RESEND_API_KEY=

# ============================================
# Cron Job Security
# ============================================
CRON_SECRET=$CRON_SECRET
EOF

print_status "Environment file created: .env.local"

# 8. Build application
print_status "Building application..."
npm run build
if [ $? -eq 0 ]; then
    print_status "Build successful"
else
    print_error "Build failed!"
    exit 1
fi

# 9. Create systemd service
print_status "Setting up systemd service..."

sudo tee /etc/systemd/system/amazon-price-tracker.service > /dev/null << EOF
[Unit]
Description=Amazon Price Tracker
After=network.target postgresql.service

[Service]
Type=simple
User=nzhang
Group=nzhang
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
EnvironmentFile=$APP_DIR/.env.local
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=amazon-price-tracker

[Install]
WantedBy=multi-user.target
EOF

print_status "Systemd service created"

# 10. Start service
print_status "Starting Amazon Price Tracker service..."
sudo systemctl daemon-reload
sudo systemctl enable amazon-price-tracker

# Stop service if already running
sudo systemctl stop amazon-price-tracker 2>/dev/null || true

# Start service
sudo systemctl start amazon-price-tracker

# Wait a moment and check status
sleep 3
if sudo systemctl is-active --quiet amazon-price-tracker; then
    print_status "Service is running on internal port $PORT"
else
    print_error "Service failed to start"
    print_status "Checking logs..."
    sudo journalctl -u amazon-price-tracker --no-pager -n 20
    exit 1
fi

# 11. Setup cron job
print_status "Setting up cron job for price alerts..."
chmod +x $APP_DIR/scripts/process-alerts.sh

# Add cron job if not already present
CRON_JOB="0 */6 * * * $APP_DIR/scripts/process-alerts.sh >> /var/log/price-tracker-cron.log 2>&1"
(crontab -l 2>/dev/null | grep -v "process-alerts" || true; echo "$CRON_JOB") | crontab -
print_status "Cron job configured (runs every 6 hours)"

# 12. Configure firewall
print_status "Checking firewall configuration..."
if command -v ufw &> /dev/null; then
    if sudo ufw status | grep -q "Status: active"; then
        # Only open internal port if Nginx is not installed
        if ! command -v nginx &> /dev/null; then
            print_status "Opening internal port $PORT in UFW firewall..."
            sudo ufw allow $PORT/tcp
        fi
    fi
fi

# Check if Nginx is installed
if command -v nginx &> /dev/null; then
    print_status "Nginx detected - site will be accessible through Nginx reverse proxy"
    print_status ""
    print_warning "NEXT STEP: Run the Nginx setup script to configure SSL:"
    print_status "  sudo ./setup-nginx-ssl.sh"
else
    print_warning "Nginx not detected"
    print_status "To use HTTPS with domain name, install Nginx and run:"
    print_status "  sudo ./setup-nginx-ssl.sh"
fi

# 13. Create log directory
sudo mkdir -p /var/log/price-tracker

# Final status
echo ""
echo "=========================================="
echo -e "${GREEN}DEPLOYMENT COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Application is running internally on port: ${GREEN}$PORT${NC}"
echo ""
if command -v nginx &> /dev/null; then
    echo "Next Step: Configure Nginx and SSL:"
    echo "  ${YELLOW}sudo ./setup-nginx-ssl.sh${NC}"
    echo ""
    echo "Once Nginx is configured, access at:"
    echo "  ${GREEN}https://$DOMAIN${NC}"
else
    echo "Temporary access (before Nginx setup):"
    echo "  ${GREEN}http://192.168.89.55:$PORT${NC}"
fi
echo ""
echo "Service Commands:"
echo "  ${YELLOW}sudo systemctl status amazon-price-tracker${NC}  - Check service status"
echo "  ${YELLOW}sudo systemctl restart amazon-price-tracker${NC} - Restart service"
echo "  ${YELLOW}sudo journalctl -u amazon-price-tracker -f${NC}   - View logs"
echo ""
echo "Important Files:"
echo "  ${YELLOW}$APP_DIR/.env.local${NC}    - Environment variables"
echo "  ${YELLOW}/var/log/price-tracker-cron.log${NC} - Cron job logs"
echo ""
echo "Credentials (save these securely!):"
echo "  Database Password: ${YELLOW}$DB_PASSWORD${NC}"
echo "  NextAuth Secret:   ${YELLOW}$NEXTAUTH_SECRET${NC}"
echo "  Cron Secret:       ${YELLOW}$CRON_SECRET${NC}"
echo ""
echo "=========================================="

# Save credentials to a file for safekeeping
CREDENTIALS_FILE="$APP_DIR/.deployment-credentials.txt"
cat > "$CREDENTIALS_FILE" << EOF
Amazon Price Tracker - Deployment Credentials
Generated: $(date)
============================================

Domain: $DOMAIN
Internal Port: $PORT (Nginx proxies from 443)

Database:
  Name:     $DB_NAME
  User:     $DB_USER
  Password: $DB_PASSWORD

NextAuth:
  URL:    https://$DOMAIN
  Secret: $NEXTAUTH_SECRET

Cron:
  Secret: $CRON_SECRET

IMPORTANT: Keep this file secure and delete it after saving credentials elsewhere!
EOF

chmod 600 "$CREDENTIALS_FILE"
print_warning "Credentials saved to: $CREDENTIALS_FILE (secure this file!)"
