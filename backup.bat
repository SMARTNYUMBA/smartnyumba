@echo off
REM SmartNyumba Pro — Automated MySQL Backup
REM Add to Windows Task Scheduler: daily at 2:00 AM

set DB_NAME=smartnyumba
set DB_USER=smartnyumba
set DB_PASS=Smartnyumba@f7z3f6
set BACKUP_DIR=C:\backups\smartnyumba
set RETAIN_DAYS=30

REM Create backup directory
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Get timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
set BACKUP_FILE=%BACKUP_DIR%\smartnyumba_%TIMESTAMP%.sql

REM Run backup using XAMPP's mysqldump
"C:\xampp\mysql\bin\mysqldump.exe" ^
  --host=127.0.0.1 ^
  --port=3306 ^
  --user=%DB_USER% ^
  --password=%DB_PASS% ^
  --single-transaction ^
  --routines ^
  --triggers ^
  %DB_NAME% > "%BACKUP_FILE%"

if %ERRORLEVEL% == 0 (
    echo Backup successful: %BACKUP_FILE%
) else (
    echo ERROR: Backup failed!
)

REM Delete backups older than RETAIN_DAYS (requires forfiles)
forfiles /p "%BACKUP_DIR%" /m "smartnyumba_*.sql" /d -%RETAIN_DAYS% /c "cmd /c del @path" 2>nul

echo Done.
