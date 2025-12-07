# Quick Start Guide

Get ZipMetro up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment

Create a `.env` file in the root directory:

```bash
# Copy the example (or create manually)
# On Windows PowerShell:
Copy-Item ENV_EXAMPLE.txt .env

# On Linux/Mac:
cp ENV_EXAMPLE.txt .env
```

Edit `.env` and change the `JWT_SECRET` to a random string (at least 32 characters).

## Step 3: Initialize Database

```bash
npm run init-db
```

This will:
- Create the database file
- Set up all tables
- Create default admin user (admin@zipmetro.com / admin123)
- Seed initial products

## Step 4: Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## Step 5: Open in Browser

Navigate to: **http://localhost:3001**

## Default Admin Login

- **Email**: `admin@zipmetro.com`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change the admin password immediately in production!

## What's Next?

- Browse products in the Shop section
- Add items to cart and place an order
- Access Admin section to manage products
- Customize the homepage ad in Admin settings

## Troubleshooting

**Port already in use?**
- Change `PORT` in `.env` file
- Or stop the process using port 3001

**Database errors?**
- Delete `data/zipmetro.db` and run `npm run init-db` again

**Can't see products?**
- Check browser console for errors
- Verify API is running: http://localhost:3001/api/products

## Production Deployment

See `README.md` for full deployment instructions including Docker setup.


