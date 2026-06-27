# Attendance & HR System Implementation Tasks

- [x] Create package.json and vercel.json configurations
- [x] Restructure Telegram storefront order notifications:
  - [x] Query and load the active branch details dynamically in `api/bot.js`
  - [x] Add Cambodia Time date/time formatting helper in `api/bot.js`
  - [x] Implement HTML parse mode and redesign the sales group notification in `api/bot.js`
  - [x] Implement HTML parse mode and redesign the employee direct message in `api/bot.js`
  - [x] Verify the updates locally, commit, and push to GitHub
- [x] Implement Split Pack/Box (បំបែកកញ្ចប់/ប្រអប់) feature:
  - [x] Add split pack action button in the Inventory dashboard actions row in `index.html`
  - [x] Add `modal-split-pack` modal dialog in `index.html`
  - [x] Add English and Khmer translation keys in `translations.js`
  - [x] Populate selects inside `populatePOSSelects()` in `app.js`
  - [x] Implement event listeners and submission handler for `split-pack-form` in `app.js`
  - [x] Verify the updates locally, commit, and push to GitHubhe Vercel app & Telegram Bot integration
- [x] Enable Admin to manually update Attendance logs & OT
  - [x] Add Action column to Attendance table in index.html
  - [x] Render Edit button in renderAttendanceLogs() in app.js
  - [x] Setup event listeners for closing/canceling the edit modal in app.js
  - [x] Implement openEditAttendanceModal() to populate the form fields
  - [x] Implement auto-calculation of working/OT hours when times change in the modal
  - [x] Implement saveAttendanceEdit() to write changes to Firestore & local storage

## Bug Fixes & Refinements
- [x] Add `enableGpsCheck` translation terms in `translations.js`
- [x] Add GPS Check checkbox in HR Settings view rendering in `app.js`
- [x] Update `renderHRDashboard()` to show both IN and OUT selfies in `app.js`
- [x] Update `cleanupOldSelfies()` to sync cleared selfies directly to Firestore in `app.js`
- [x] Update `telegram-camera.html` native fallback to omit `capture="user"` and style it prominently
- [x] Update `api/bot.js` message text to provide fallback links and photo upload instructions
- [x] Implement direct check-in/out link bypass when GPS check is disabled in `api/bot.js`
- [x] Add `|| 0` to coordinates in direct photo upload checks in `api/bot.js` to prevent Firestore crashes
