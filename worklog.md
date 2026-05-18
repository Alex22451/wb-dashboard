---
Task ID: 1
Agent: Main
Task: Fix "sandbox is inactive" error and add missing API keys

Work Log:
- Identified that dev server process was being killed when Bash tool command completed
- Tried multiple approaches: nohup, setsid, systemd - none worked
- Discovered that double-fork pattern `(command &)` successfully detaches process from shell
- Created dev-daemon.sh with auto-restart loop for persistence
- Started dev server using double-fork: `(bash dev-daemon.sh &)`
- Server now survives between Bash commands and auto-restarts if it crashes
- Updated API keys for 5 entrepreneurs in the database:
  - Бураго Т.В. (id=1) → key added
  - Масляков Л.А. (id=3) → key added
  - Масляков В.А. (id=4) → key added
  - Масляков А.А. (id=5) → key added
  - Зубахина Н.В. (id=7) → key added
- Боев Ф.В. (id=2) has no API key (user didn't provide one)
- Зубахин А.В. (id=6) already had an API key

Stage Summary:
- Dev server running persistently via double-fork daemon at port 3000
- All API endpoints responding with HTTP 200
- 6 out of 7 entrepreneurs now have WB API keys
- Only Боев Ф.В. remains without an API key

---
Task ID: 2
Agent: Main
Task: Add "Нагрузка производства" (Production Load) tab with thermometer

Work Log:
- Analyzed mathematical formula for production load calculation
- Formula: Production Load = Σ (FBS_orders × itemsMultiplier) where itemsMultiplier comes from product name ("6 шт"→6, "4 шт"→4, "2 шт"→2, else→1)
- Capacity: 2300 FBS items/day maximum
- Load % = (items / 2300) × 100
- Color thresholds: <70% green, 70-90% orange, >90% red

Changes made:
1. wb-mapping.ts:
   - Renamed "набор" → "набор 4шт" for дорожки sets
   - Renamed "набор" product types → "набор для слепков" / "набор для рисования" (to avoid confusion with pack-size "набор")
   - Added extractItemsMultiplier() function

2. wb-data/route.ts:
   - Added section=production with 10-day default date range
   - Calculates FBS items per product per day (orders × multiplier)
   - Returns daily/weekly/monthly load summaries
   - Returns per-product breakdown with items and orders

3. page.tsx:
   - Added ProductionLoadData interface
   - Added Thermometer icon import
   - Created ProductionLoadTab component with:
     - 3 thermometer gauges (yesterday, week avg, month avg)
     - Color-coded progress bars with threshold markers (70%, 90%)
     - Daily load table with date/orders/items/load%/visual bar
     - Weekly and monthly summary cards
     - Top-15 products breakdown table showing multiplier, orders, items, share
   - Added "Нагрузка" tab between "Ежедневные" and "По месяцам"

Stage Summary:
- New "Нагрузка производства" tab fully functional
- Thermometer gauges show load % with color coding (green/orange/red)
- Product breakdown shows which products contribute most to production load
- Multi-pack products (набор 4шт, набор 6 шт) correctly multiply orders to items
- All lint checks pass
