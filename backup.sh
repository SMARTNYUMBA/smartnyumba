#!/bin/bash
# SmartNyumba Pro — Automated MySQL Backup Script
# Add to Windows Task Scheduler to run daily at 2am
# Or on Linux: crontab -e → 0 2 * * * /path/to/backup.sh

DB_NAME="smartnyumba"
DB_USER="smartnyumba"
DB_PASS="Smartnyumba@f7z3f6"
BACKUP_DIR="C:/backups/smartnyumba"   # Change to your preferred backup location
RETAIN_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/smartnyumba_$TIMESTAMP.sql.gz"

# Run the backup
echo "Starting backup: $BACKUP_FILE"
mysqldump \
  --host=127.0.0.1 \
  --port=3306 \
  --user=$DB_USER \
  --password=$DB_PASS \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  $DB_NAME | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Backup successful: $BACKUP_FILE"
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "   Size: $SIZE"
else
  echo "❌ Backup FAILED"
  exit 1
fi

# Remove backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "smartnyumba_*.sql.gz" -mtime +$RETAIN_DAYS -delete
echo "Cleaned backups older than $RETAIN_DAYS days"

echo "Done."
