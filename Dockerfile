# Use Node.js 22 Alpine as base image for minimal size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Install build dependencies for canvas (required by chartjs-node-canvas)
# These are needed for native module compilation
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies using npm ci for deterministic builds
# Skip optional dependencies and audit for faster installation
RUN npm ci --no-fund --no-audit && npm cache clean --force

# Copy application source code
COPY . .

# Expose port 3000 (informational)
EXPOSE 3000

# Start the API server using tsx to run TypeScript directly
CMD ["npm", "run", "start:api"]
