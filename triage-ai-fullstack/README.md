# Triage AI Command Center — Full-stack Realtime (Hackathon)

Monorepo 2 khối độc lập, giao tiếp realtime qua **Socket.io**:

```
triage-ai-fullstack/
├── backend/        # Node.js + Express + Socket.io  (port 5000)
│   ├── package.json
│   └── server.js   # REST + WebSocket + mock DB in-memory
└── frontend-web/   # React + Vite + Tailwind        (port 5174)
    ├── package.json / vite.config.js / tailwind.config.js / .env
    └── src/
        ├── services/socket.js  # io('http://localhost:5000')
        ├── services/api.js     # axios REST
        ├── components/TopBar.jsx | PredictiveChart.jsx | ResourceBars.jsx | TriageRadar.jsx | Dashboard.jsx
        └── App.jsx
```

## Chạy 2 terminal song song

**Terminal 1 — Backend:**
```bash
cd triage-ai-fullstack/backend
npm install
npm start
# -> [backend] Triage AI API live on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd triage-ai-fullstack/frontend-web
npm install
npm run dev
# -> http://127.0.0.1:5174/
```

> Frontend chạy port **5174** để không đụng app cũ ở 5173. Backend phải chạy trước (socket + REST).

## Luồng demo pitch (không cần Mobile App)

1. Mở dashboard → Socket LIVE, 2 ca seed (#BN-201/202) trên Radar.
2. Giả lập App bệnh nhân gửi ca mới (terminal 3 hoặc Postman):
   ```bash
   curl -X POST http://localhost:5000/api/emergency ^
     -H "Content-Type: application/json" ^
     -d "{\"symptom\":\"Đau thắt ngực (từ App)\",\"severity\":\"critical\",\"hr\":126,\"spo2\":90}"
   ```
   → Dashboard kêu **Bíp** + card mới **slide-in** đầu Radar.
3. Bấm **Nhận Ca** → `ACCEPT_PATIENT` → ICU −1, card biến mất, progress bar tuột mượt.

## API nhanh

| Method | Endpoint         | Mô tả                              |
|--------|------------------|------------------------------------|
| GET    | `/api/health`    | Ping                               |
| GET    | `/api/dashboard` | Toàn trạng thái (stats/chart/patients) |
| POST   | `/api/emergency` | Tạo ca mới + emit `NEW_EMERGENCY`  |

## Deploy

- Backend: Render/Railway (`npm start`, set `PORT`).
- Frontend: Vercel (`npm run build`), đổi `VITE_API_URL` / `VITE_SOCKET_URL` trong `.env` sang URL backend production.
