# Pre-Deploy Checklist

This document explains the pre-deploy validation system for catching build failures locally before pushing to GitHub/Render.

## Quick Start

Before pushing code to GitHub (which triggers Render deployment), run:

```bash
npm run preflight
```

If it passes, you're good to push and deploy. If it fails, fix the errors and re-run.

## What Preflight Checks

The preflight system automatically:

1. **Detects Node.js applications** in your repo by scanning for `package.json` files in:
   - Root directory (`./`)
   - `./backend`
   - `./frontend`
   - Any other first-level directories with `package.json`

2. **For each detected Node app**, it checks:
   - Node.js and npm versions
   - `package-lock.json` existence
     - If present: runs `npm ci` (production-safe install)
     - If missing: warns and runs `npm install --include=dev`
   - Runs `npm run lint` (if script exists)
   - Runs `npm test` (if script exists and is not placeholder)
   - Runs `npm run build` (if script exists)

3. **Provides clear output** with:
   - ✓ PASS indicators for successful checks
   - ✗ FAIL indicators for failures
   - ⚠ WARNING indicators for non-critical issues
   - Color-coded output for easy scanning

## Docker Preflight (Optional)

To also check Docker builds locally:

```bash
npm run preflight:docker
```

This will:
- Check if Docker is installed (if not, prints instructions and exits successfully)
- If `Dockerfile` exists, run a full Docker build with `--no-cache`
- Clean up the test image after successful build

**Note:** Docker preflight is optional. If Docker isn't installed, it won't fail the check.

## Workflow

1. **Make your changes** to the codebase
2. **Run preflight**: `npm run preflight`
3. **If it passes**: Push to GitHub and deploy
4. **If it fails**: 
   - Read the error messages
   - Fix the issues
   - Re-run `npm run preflight`
   - Repeat until all checks pass

## Common Issues

### Missing package-lock.json
- **Warning**: You'll see a warning if `package-lock.json` is missing
- **Fix**: Run `npm install` in the affected directory to generate it
- **Best practice**: Always commit `package-lock.json` for reproducible builds

### npm ci fails
- **Cause**: `package-lock.json` is out of sync with `package.json`
- **Fix**: Run `npm install` to update the lockfile, then commit it

### Build script fails
- **Cause**: Your build process has errors
- **Fix**: Check the build output for specific error messages
- **Note**: This is the same error Render would see, so fixing it locally prevents failed deployments

### Lint errors
- **Cause**: Code doesn't pass linting rules
- **Fix**: Run `npm run lint` manually to see detailed errors, then fix them

## Scripts Reference

- `npm run preflight` - Run full preflight check (Node apps + dependencies)
- `npm run preflight:docker` - Run Docker build check (optional)

## Exit Codes

- **Exit 0**: All checks passed ✓
- **Exit 1**: One or more checks failed ✗

The script uses `set -e` to exit immediately on any error, ensuring you catch issues early.

## Integration with CI/CD

While this is designed for local pre-deployment checks, the same principles apply to CI/CD:
- Render will run similar checks during deployment
- Catching issues locally saves time and prevents failed deployments
- The preflight system mimics what Render does, so passing locally means it should pass on Render

---

**Remember**: Always run `npm run preflight` before pushing to GitHub!

