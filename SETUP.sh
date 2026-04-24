#!/bin/bash
# ================================================
# LEGO Collection — One-time GitHub Setup
# Run this ONCE from the folder containing these files
# ================================================

TOKEN=""
USERNAME="jroubos"
REPO="lego-collection"

echo ""
echo "🧱 LEGO Collection GitHub Setup"
echo "================================"

# Step 1: Create the repo
echo "📁 Creating GitHub repository..."
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO\",\"description\":\"My personal LEGO collection database\",\"private\":false,\"auto_init\":false}" > /tmp/repo_result.json
cat /tmp/repo_result.json | grep -E '"full_name"|"html_url"|"message"' | head -3

# Step 2: Push files
echo ""
echo "📤 Pushing files to GitHub..."
cd "$(dirname "$0")"
git init
git config user.email "$USERNAME@github.com"
git config user.name "$USERNAME"
git add .
git commit -m "Initial LEGO collection setup 🧱"
git branch -M main
git remote add origin "https://$TOKEN@github.com/$USERNAME/$REPO.git"
git push -u origin main

echo ""
echo "✅ Files pushed!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 LAST STEP — Enable GitHub Pages:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  1. Go to: https://github.com/$USERNAME/$REPO/settings/pages"
echo "  2. Under 'Source' select: Deploy from a branch"
echo "  3. Branch: main  /  Folder: / (root)"  
echo "  4. Click Save"
echo ""
echo "  Your collection will be live at:"
echo "  👉 https://$USERNAME.github.io/$REPO/"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 IMPORTANT — Revoke your token now!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  This script contains your token in plain text."
echo "  After running it:"
echo "  1. Go to: https://github.com/settings/tokens"
echo "  2. Delete 'lego-collection' token"
echo "  3. Create a new one (same settings)"
echo "  4. Open your collection site and click 🔑 to enter the new token"
echo ""
