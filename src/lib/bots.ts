// Crawlers and automated browsers (Google's renderer, Lighthouse, SEO tools…) aren't visitors.
// Shared by the app (it doesn't start analytics) and the server (it doesn't store their reports).
// Link-preview fetchers (WhatsApp, Slack…) don't run the app, so they never get this far.
export const isBotAgent = (ua: string, webdriver = false) =>
  // Crawler signatures, not the word "bot" alone (a few real phones have it in their name):
  // "Googlebot/2.1", "+http://www.google.com/bot.html", headless and audit browsers.
  webdriver || /bot\/|bot\.html|\+https?:|crawl|spider|slurp|headlesschrome|lighthouse|pagespeed|google-inspectiontool|yandex|baiduspider/i.test(ua);
