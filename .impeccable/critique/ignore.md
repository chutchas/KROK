# Critique ignore list (user decisions, 2026-10-09)

- Landing CTA gradient contrast (white on cyan start of `.lp-btn-primary` gradient): intentional design, user likes it.
- Date field showing both Gregorian (native, device-dependent) and Buddhist-era dates: intentional, depends on the user's device.
- Jargon "ชุดข้อมูล" and "การ์ด" in nav/dashboard: keep as is.
- Red asterisk on every required field: keep as is.
- Dashboard "จำนวนการใช้งาน" 7-day and 30-day cards (2026-10-15): not duplicates — different time ranges; equal values only because the workspace has 2 submissions so far. Do not report as duplicate/redundant.
- The English term "workspace" in Thai UI (2026-10-15, r37): chosen as the single term for the tenant. Do not report the English word itself; still report places that call the same thing "องค์กร" (signup/landing "องค์กร" meaning company is fine).
- Datasets empty state has no create button (2026-10-16, r42): intentional — the single "สร้างชุดข้อมูล" button in the page header is the tour target; adding a second one in the empty state was reported as a duplicate CTA (r33). The empty-state hint points to the header button. Do not report.
- Dashboard card titles look identical for 7/14/30-day variants (2026-10-16): the visible period is shown on the card's period switch; screen readers get the range in the h3. Do not report.
