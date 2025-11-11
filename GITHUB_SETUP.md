# GitHub Setup Instructions

## Quick Setup (Recommended)

### Step 1: Create Repository on GitHub

1. Go to: https://github.com/new
2. Fill in:
   - **Repository name**: `career-intelligence-pipeline`
   - **Description**: Career Intelligence ETL Pipeline - Node.js/TypeScript for Railway
   - **Private**: ✅ (recommended)
   - **Do NOT initialize** with README, .gitignore, or license (we already have these)
3. Click "Create repository"

### Step 2: Push Code (Run these commands)

Once the repo is created, GitHub will show you commands. Run these:

```powershell
# Add remote
git remote add origin https://github.com/YOUR_USERNAME/career-intelligence-pipeline.git

# Rename branch to main (if needed)
git branch -M main

# Push code
git push -u origin main
```

**Replace `YOUR_USERNAME` with your GitHub username**

Example for worldbibleproject:
```powershell
git remote add origin https://github.com/worldbibleproject/career-intelligence-pipeline.git
git branch -M main
git push -u origin main
```

---

## Alternative: Quick Commands (Copy/Paste)

If your GitHub username is **worldbibleproject**, just run:

```powershell
git remote add origin https://github.com/worldbibleproject/career-intelligence-pipeline.git
git branch -M main  
git push -u origin main
```

The first push will prompt you to login to GitHub via your browser.

---

## After Pushing

### Connect to Railway (Auto-Deploy)

1. Go to Railway dashboard: https://railway.com/project/fe07ed1a-e426-4fc7-9230-e1131c529079
2. Click on `career-api` service
3. Go to Settings
4. Under "Source", click "Connect Repo"
5. Select your GitHub repository: `career-intelligence-pipeline`
6. Save

**Now every git push will automatically deploy to Railway!** 🚀

---

## Verify Setup

After pushing, verify:

```powershell
# Check remote
git remote -v

# Should show:
# origin  https://github.com/YOUR_USERNAME/career-intelligence-pipeline.git (fetch)
# origin  https://github.com/YOUR_USERNAME/career-intelligence-pipeline.git (push)
```

---

## Future Updates

After initial setup, to deploy changes:

```powershell
git add .
git commit -m "Your change description"
git push
```

Railway will automatically detect the push and redeploy! ✅
