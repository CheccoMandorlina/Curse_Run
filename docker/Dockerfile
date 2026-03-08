FROM node:22-alpine AS base
WORKDIR /app

COPY package.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY app/package.json app/package.json

RUN npm install

COPY . .
RUN npm run build

EXPOSE 3007
ENV PORT=3007
ENV SQLITE_PATH=/data/curse-run.db
CMD ["npm", "run", "start", "-w", "server"]
