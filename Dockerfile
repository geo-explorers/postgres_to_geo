# Use Node.js 22 Alpine as base image for minimal size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies, skipping optional packages (chart.js/canvas not needed for API)
RUN npm ci --omit=optional --no-fund --no-audit && npm cache clean --force

# Copy application source code
COPY . .

# Expose port 3000 (informational)
EXPOSE 3000

# Start the API server using tsx to run TypeScript directly
CMD ["npm", "run", "start:api"]
