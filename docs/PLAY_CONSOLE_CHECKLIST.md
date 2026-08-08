# Google Play launch checklist

Do not submit to production until every item is true.

## Identity and ownership

- [ ] Business legal name, address, phone and support email are verified in Play Console.
- [ ] Package name is final and matches Expo, Firebase, Meta, TikTok and RevenueCat.
- [ ] Play App Signing is enabled and both Play signing SHA fingerprints are registered in Firebase/Meta.
- [ ] At least two trusted owners have hardware-key-protected access; no credentials are shared.

## App content

- [ ] Privacy policy is public, accurate, non-editable by ordinary users and contains no placeholder text.
- [ ] In-app account deletion and public web deletion both work end to end.
- [ ] Data Safety form is completed from `DATA_SAFETY_WORKSHEET.md` and verified against the final AAB.
- [ ] Ads declaration says no ads unless the product has actually added them.
- [ ] Content rating questionnaire reflects user-generated item text, photos, videos and reports.
- [ ] Target audience is adults; children are not included in the target audience.
- [ ] App access instructions provide two durable review accounts and exact steps for a two-party transaction.
- [ ] Financial-features declaration accurately states that PackProof does not move transaction funds or provide escrow; its own digital subscription uses Play Billing.
- [ ] UGC policy, in-app report and block flows are available and a staff moderation process exists.

## Store listing

- [ ] App name: `PackProof`.
- [ ] Short description is 80 characters or fewer.
- [ ] Full description avoids claims of authentication, guaranteed proof, legal admissibility, escrow, insurance, fraud prevention or dispute resolution.
- [ ] 512×512 Play icon, 1024×500 feature graphic, phone screenshots and optional preview video are uploaded.
- [ ] Support email and website are monitored.
- [ ] Category is selected after checking the current Console choices; likely Tools or Business, not Finance.

## Payments

- [ ] All in-app digital Pro features use Google Play Billing.
- [ ] `pro` RevenueCat entitlement and current offering are active.
- [ ] Monthly/yearly Play base plans are active in all chosen countries with reviewed local prices/taxes.
- [ ] Paywall shows actual localized Play price and renewal language.
- [ ] Purchase, cancellation, expiration, renewal, upgrade/downgrade and restore have been tested with license testers.
- [ ] RevenueCat webhook returns 200, rejects bad authorization and updates the correct Firebase UID.
- [ ] A user can reach Google Play subscription management from the product/support experience.

## Security and reliability

- [ ] `npm run doctor`, typecheck, backend build, lint and rule tests all pass.
- [ ] Play pre-launch report has no blocker crash, ANR, accessibility or security warning.
- [ ] Play Integrity App Check metrics show valid requests before enforcement is enabled.
- [ ] An unrelated test account cannot read another transaction, evidence file or export.
- [ ] One-use invites expire and cannot be replayed.
- [ ] Uploaded evidence cannot be overwritten by either participant.
- [ ] TikTok OAuth rejects changed/expired state and one identity cannot link to two PackProof users.
- [ ] Firebase/Cloud/RevenueCat alerts and budget alerts go to monitored people.
- [ ] Production and testing data are separated.

## Release sequence

- [ ] Internal test passed on at least one current Android and one Android 8+ device.
- [ ] Closed test meets the current Play testing requirement for this developer account.
- [ ] Google, Meta and TikTok sign-ins are approved/live for non-admin users.
- [ ] Reviewer instructions explain that two accounts/devices are needed and supply a pre-populated transaction if permitted.
- [ ] Rollout starts staged (for example 5–10%), monitoring crash-free users, functions, storage, support and billing.
- [ ] Rollback/incident owner is available during rollout.
