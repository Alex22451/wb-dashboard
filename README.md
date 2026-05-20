# WB Dashboard

Internal analytics dashboard for Wildberries orders by entrepreneur, product, FBS/FBO flow, production load, supply planning, advertising spend, and Excel-vs-WB reconciliation.

## Stack

- Next.js App Router
- React 19
- Tailwind CSS / shadcn-style UI components
- Prisma with SQLite for local data
- Wildberries Statistics API and Sales Funnel API
- XLSX import for Excel reports

## Local Setup

```bash
npm install
npx prisma generate
node --experimental-strip-types scripts/import-excel.ts
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create `.env` from `.env.example`:

```bash
DATABASE_URL=file:../db/custom.db
```

The SQLite path is relative to `prisma/schema.prisma`.

## Notes

- `db/*.db`, `.env`, uploaded Excel files, logs, and build artifacts are ignored by git.
- The Excel import script preserves existing WB API keys when reseeding entrepreneurs.
- `/api/wb-compare` uses WB Orders API by default because it is currently closest to the Excel report totals. Sales Funnel can be tested with `source=funnel`, but in current real-data checks it undercounts this project’s Excel export.
