FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN ls -la dist/
EXPOSE 3001
CMD ["node", "dist/server.js"]