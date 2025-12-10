FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev dependencies for better compatibility)
RUN npm ci

# Copy application files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY assets/ ./assets/ 2>/dev/null || true

# Create necessary directories
RUN mkdir -p data uploads

# Expose port (Render.com uses PORT env var)
EXPOSE ${PORT:-3001}

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "backend/server.js"]


