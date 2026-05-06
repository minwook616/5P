# Render Deployment — Recommended Settings

This project expects the backend to run from the `backend/` working directory when using the current import layout (`from email_service import ...`).

Recommended Render service settings:

- **Working Directory**: `backend`
- **Start Command**:

```
uvicorn server:app --host 0.0.0.0 --port $PORT
```

- **Environment Variables (examples)**:
  - `MONGO_URL` — MongoDB connection string
  - `DB_NAME` — database name
  - `JWT_SECRET` — JWT HMAC secret
  - `APP_ENV=prod` — production flag
  - `FRONTEND_URL` — frontend origin
  - `RUN_MIGRATIONS=false` — default to false to avoid accidental writes

Notes:
- If you prefer to run Uvicorn from the project root as `uvicorn backend.server:app`, change the import in `backend/server.py` to `from backend.email_service import ...` and update the start command accordingly.
- Ensure `secure=True` cookie flags in production and that your site uses HTTPS so cookies are sent by browsers.

Troubleshooting:
- If you get `ModuleNotFoundError: No module named 'backend'`, the Start Command and Working Directory are mismatched. Use the settings above.
