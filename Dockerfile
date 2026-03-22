FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend ./

RUN ./node_modules/.bin/tsc -p tsconfig.json

EXPOSE 3001

CMD ["node", "dist/server.js"]