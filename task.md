# Attendance & HR System Implementation Tasks

- [x] Create package.json and vercel.json configurations
- [x] Create Telegram Bot Webhook API handler (api/bot.js)
- [x] Add new translations to translations.js
- [x] Add CSS styling helper classes for HR UI in style.css
- [x] Implement UI views and dashboard layout in index.html
- [x] Implement database sync, state management, and UI rendering in app.js
- [x] Deploy and verify the Vercel app & Telegram Bot integration
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
