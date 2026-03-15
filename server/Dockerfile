# ── Node.js Server Dockerfile ──
FROM node:18-alpine

# Set timezone
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "index.js"]
