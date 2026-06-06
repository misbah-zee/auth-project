# Secure Auth App

Full-stack authentication demo with signup, password login, OTP login, JWT sessions, MongoDB, and deploy-ready frontend/backend folders.

## Project Structure

- `auth-project/frontend` - static HTML/CSS/JS frontend for Vercel
- `auth-project/backend` - Node.js/Express/MongoDB API for Railway

## Local Backend

```bash
cd auth-project/backend
npm install
copy .env.example .env
npm run dev
```

Set `MONGO_URI` in `.env` if you are using MongoDB Atlas or Railway MongoDB.

## Local Frontend

Open `auth-project/frontend/index.html` in a browser. It calls `http://localhost:5000` automatically on localhost.

## Railway Backend Deploy

1. Create a Railway project from this GitHub repo.
2. Set the Railway service root directory to:

```text
auth-project/backend
```

3. Add environment variables:

```text
MONGO_URI=your MongoDB connection string
JWT_SECRET=any long random secret
FRONTEND_URL=https://your-vercel-app.vercel.app
```

4. Optional email OTP variables:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your Gmail address
SMTP_PASS=your Gmail app password
```

5. Optional phone OTP variables through Twilio:

```text
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_PHONE=+1...
```

Without SMTP/Twilio, OTP still works in demo mode because the API returns the OTP to the frontend toast for testing.

## Vercel Frontend Deploy

1. Import this GitHub repo into Vercel.
2. Set the Vercel root directory to:

```text
auth-project/frontend
```

3. Framework preset: `Other`.
4. Build command: leave empty.
5. Output directory: leave empty.
6. After Railway deploys, edit `auth-project/frontend/config.js`:

```js
window.AUTH_API_BASE_URL = 'https://your-railway-service.up.railway.app';
```

7. Commit and push, then redeploy Vercel.

## API Endpoints

- `GET /api/health`
- `POST /api/signup`
- `POST /api/login`
- `POST /api/otp/send`
- `POST /api/otp/verify`
- `GET /api/me`
