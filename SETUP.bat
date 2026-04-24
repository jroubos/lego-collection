@echo off
REM ================================================
REM LEGO Collection — One-time GitHub Setup (Windows)
REM Run this ONCE from the folder containing these files
REM ================================================

set TOKEN=
set USERNAME=jroubos
set REPO=lego-collection

echo.
echo 🧱 LEGO Collection GitHub Setup
echo ================================

echo Creating GitHub repository...
curl -s -X POST ^
  -H "Authorization: token %TOKEN%" ^
  -H "Accept: application/vnd.github.v3+json" ^
  -H "Content-Type: application/json" ^
  https://api.github.com/user/repos ^
  -d "{\"name\":\"%REPO%\",\"description\":\"My personal LEGO collection database\",\"private\":false,\"auto_init\":false}"

echo.
echo Pushing files to GitHub...
git init
git config user.email "%USERNAME%@github.com"
git config user.name "%USERNAME%"
git add .
git commit -m "Initial LEGO collection setup"
git branch -M main
git remote add origin "https://%TOKEN%@github.com/%USERNAME%/%REPO%.git"
git push -u origin main

echo.
echo ✅ Done! Now go to:
echo https://github.com/%USERNAME%/%REPO%/settings/pages
echo Set source to: main branch / root folder
echo.
echo Your site will be at:
echo https://%USERNAME%.github.io/%REPO%/
echo.
echo ⚠️  Revoke your token at https://github.com/settings/tokens
pause
