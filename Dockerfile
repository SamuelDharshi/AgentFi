FROM node:22-alpine

WORKDIR /app

# Install root dependencies (concurrently, rimraf)
COPY package.json ./
RUN npm install

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm install --prefix backend

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm install --prefix frontend

# Copy all source code
COPY . .

# Build TypeScript backend and Next.js frontend
RUN npm run build:backend && npm run build:frontend

EXPOSE 3000
EXPOSE 4000

CMD ["npm", "start"]
FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend ./

RUN ./node_modules/.bin/tsc -p tsconfig.json

EXPOSE 3001

CMD ["node", "dist/server.js"]
