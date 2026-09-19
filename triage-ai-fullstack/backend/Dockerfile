# Backend production image — Node 24 + SQLite, long-running process + Socket.io.
# KHÔNG dùng serverless (cần process lâu dài + disk). Build: docker build -t triage-backend ./triage-ai-fullstack/backend
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . ./
ENV NODE_ENV=production PORT=5000 DATABASE_PATH=/data/hospital.db
VOLUME ["/data"]
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)})" || exit 1
CMD ["npm", "start"]
