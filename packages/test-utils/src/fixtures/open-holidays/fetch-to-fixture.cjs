// Preloaded into connector runs: sends OpenHolidays requests to OW_TEST_OPEN_HOLIDAYS_URL.
const fixtureUrl = process.env.OW_TEST_OPEN_HOLIDAYS_URL;
const realFetch = globalThis.fetch;

if (fixtureUrl) {
  globalThis.fetch = (input, init) =>
    realFetch(String(input).replace('https://openholidaysapi.org', fixtureUrl), init);
}
