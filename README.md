# ZipMetro - Full-Stack Delivery Platform

A modern, production-ready full-stack application for cannabis delivery services. Built with Node.js, Express, SQLite, and vanilla JavaScript.

## Features

- 🛍️ **Product Catalog** - Browse and manage products by category
- 🛒 **Shopping Cart** - Add items and manage quantities
- 📦 **Order Management** - Place orders with delivery details
- 👤 **User Authentication** - Secure user registration and login
- 🆔 **ID Verification** - Age verification system
- 📱 **Notifications** - SMS, Email, and Push notification preferences
- 👨‍💼 **Admin Dashboard** - Manage products, orders, and settings
- 🎨 **Modern UI** - Responsive, accessible design with mobile-first approach

## Tech Stack

### Backend
- **Node.js** + **Express** - Server framework
- **SQLite** - Database (easily switchable to PostgreSQL)
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Helmet** - Security middleware
- **Morgan** - HTTP request logging

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **Modern CSS** - Custom properties, responsive design
- **Accessible** - WCAG compliant, keyboard navigation

## Project Structure

```
zipmetro/
├── backend/
│   ├── server.js           # Main server file
│   ├── database/
│   │   └── db.js          # Database connection and setup
│   ├── routes/
│   │   ├── products.js   # Product CRUD endpoints
│   │   ├── orders.js      # Order management
│   │   ├── users.js       # User profile management
│   │   ├── admin.js       # Admin dashboard APIs
│   │   └── auth.js         # Authentication endpoints
│   └── middleware/
│       └── auth.js         # JWT authentication middleware
├── frontend/
│   └── index.html         # Single-page application
├── data/                  # Database files (gitignored)
├── .env.example           # Environment variables template
├── package.json           # Dependencies
└── README.md              # This file
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm 8+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd zipmetro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and update the `JWT_SECRET` with a strong random string.

4. **Initialize the database**
   The database will be automatically created on first run, but you can also run:
   ```bash
   npm run init-db
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify` - Verify JWT token

### Products
- `GET /api/products` - Get all products (query: `?category=Flower&search=term`)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Orders
- `GET /api/orders` - Get user's orders (or all if admin)
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create new order
- `PATCH /api/orders/:id/status` - Update order status (admin only)

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update profile
- `POST /api/users/me/id` - Submit ID verification
- `PUT /api/users/me/notifications` - Update notification preferences

### Admin
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/settings` - Get admin settings
- `PUT /api/admin/settings` - Update admin settings
- `GET /api/admin/orders` - Get all orders

## Default Admin Account

On first run, a default admin account is created:
- **Email**: `admin@zipmetro.com`
- **Password**: `admin123` (⚠️ **CHANGE THIS IN PRODUCTION!**)

## Environment Variables

See `.env.example` for all available configuration options.

### Required
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Environment (development/production)

### Optional
- `FRONTEND_URL` - CORS origin
- `DATABASE_PATH` - SQLite database file path
- `DATABASE_URL` - PostgreSQL connection string (if using PostgreSQL)

## Production Deployment

### Using Docker

1. **Build the image**
   ```bash
   docker build -t zipmetro .
   ```

2. **Run the container**
   ```bash
   docker run -p 3001:3001 --env-file .env zipmetro
   ```

### Manual Deployment

1. **Set production environment**
   ```bash
   export NODE_ENV=production
   ```

2. **Install production dependencies**
   ```bash
   npm ci --only=production
   ```

3. **Start the server**
   ```bash
   npm start
   ```

### Recommended Production Setup

- Use **PostgreSQL** instead of SQLite for better performance
- Set up **reverse proxy** (nginx) for SSL/TLS
- Use **PM2** or similar for process management
- Enable **rate limiting**
- Set up **backup** for database
- Configure **logging** service
- Use **CDN** for static assets
- Set up **monitoring** (e.g., Sentry)

## Database Migration (PostgreSQL)

To switch from SQLite to PostgreSQL:

1. Install PostgreSQL driver:
   ```bash
   npm install pg
   ```

2. Update `backend/database/db.js` to use PostgreSQL connection

3. Update `.env` with `DATABASE_URL`

4. Run migrations (create migration scripts as needed)

## Security Considerations

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Input validation
- ✅ SQL injection prevention (parameterized queries)
- ⚠️ Change default admin password
- ⚠️ Use strong JWT_SECRET
- ⚠️ Enable HTTPS in production
- ⚠️ Implement rate limiting
- ⚠️ Add file upload validation
- ⚠️ Set up proper ID verification service

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses `nodemon` for automatic server restarts on file changes.

### Project Structure Best Practices

- Keep routes modular and focused
- Use middleware for cross-cutting concerns
- Validate all inputs
- Handle errors gracefully
- Use environment variables for configuration

## License

ISC

## Support

For issues and questions, please open an issue on the repository.

---

**Note**: This is a demo application. For production use, ensure compliance with local regulations regarding cannabis delivery services, age verification, and data privacy.


