# The name decision (Phase 4)

The plan says: before anything public, commit to Glasshouse or pick a fresh name. This is the decision, written
so Christopher can make it in five minutes. The product itself does not care: `NEXT_PUBLIC_PRODUCT_NAME` renames
every page and `NEXT_PUBLIC_CONNECT_COMMAND` changes the command the landing page shows.

## Recommendation

**Keep Glasshouse for the private test (Phase 4), and decide the launch name before Phase 5**, when the Product Hunt
page and the npm package are made. Reasons:

- The test is ten invited people. Nobody is searching for the name, so the crowded market (`docs/name-check.md`)
  costs nothing for now.
- The name is not the thing being tested. The tab-open-on-day-five test is.
- The trademark position is better than the market position: the only live GLASSHOUSE word mark in class 42
  expired in June 2026 and can be recovered until 2 December 2026. Recheck TMview after that date; if it lapses for
  good, Glasshouse is cleaner than it looks today.

## If keeping Glasshouse for launch

1. Backorder `useglasshouse.com` (in redemption, expected to drop around October 2026) and make an offer on
   `glasshousehq.com` (parked).
2. Take `getglasshouse` on GitHub and X.
3. Publish the connector as `glasshouse-connect` on npm (`glasshouse` and `@glasshouse/*` are taken). Set
   `NEXT_PUBLIC_CONNECT_COMMAND="npx glasshouse-connect connect"` and rename the CLI's `bin` to match.
4. Recheck TMview for GLASSHOUSE in classes 9 and 42 in the UK, EU and US after 2 December 2026.

## If choosing a fresh name

Candidates from the brief still open: **The Bridge**, **Sitewatch**, **Overlook**, **Second Screen**. Run the same
check as `docs/name-check.md` (RDAP for domains, TMview for marks, npm, GitHub, X), then:

1. Set `NEXT_PUBLIC_PRODUCT_NAME` and `NEXT_PUBLIC_CONNECT_COMMAND` in the web app's environment.
2. Rename the connector package (`packages/connector/package.json`: `name` and `bin`).
3. Search the repository for "Glasshouse" in user-facing docs (`docs/running-the-room.md`) and replace.

Everything else (folder names, `GLASSHOUSE_*` environment variables, the `~/.glasshouse` folder) can stay as the
codename indefinitely; users never see them.
