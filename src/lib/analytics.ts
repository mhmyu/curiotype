import { siteConfig } from '@/config/site';
import { buildBeaconSrc } from './analytics-config';

/**
 * Thin analytics wrapper (Cloudflare Web Analytics, see `analytics-config.ts`).
 *
 * It does nothing unless all of these hold: a token is configured, the build is a production
 * build, and the visitor has not asked not to be tracked (Do Not Track or Global Privacy
 * Control). The beacon is added as a script tag at runtime, so a visitor who opted out never
 * even downloads it. No custom events and no WPM or other personal data are ever sent; the
 * provider only sees page views and page-load timings.
 */

export interface AnalyticsEnvironment {
  token: string | undefined;
  /** True for `astro dev` and test runs. */
  isDev: boolean;
  /** `navigator.doNotTrack` (`"1"` means opted out; some older browsers use `"yes"`). */
  doNotTrack?: string | null;
  /** `navigator.globalPrivacyControl`. */
  globalPrivacyControl?: boolean;
}

/** Pure decision: should the beacon be loaded? */
export function shouldLoadAnalytics(env: AnalyticsEnvironment): boolean {
  if (!env.token || env.isDev) return false;
  if (env.doNotTrack === '1' || env.doNotTrack === 'yes') return false;
  if (env.globalPrivacyControl === true) return false;
  return true;
}

/**
 * Adds the beacon script to the document when `shouldLoadAnalytics` allows it. Returns whether
 * a script was added. Calling it twice adds nothing the second time.
 */
export function loadAnalytics(env: AnalyticsEnvironment, doc: Document): boolean {
  if (!shouldLoadAnalytics(env) || !env.token) return false;
  const src = buildBeaconSrc(env.token);
  if (doc.querySelector(`script[src="${src}"]`)) return false;
  const script = doc.createElement('script');
  script.type = 'module';
  script.src = src;
  script.async = true;
  doc.head.appendChild(script);
  return true;
}

/** Entry point used by the layout: reads the real configuration and browser state. */
export function initAnalytics(): boolean {
  if (typeof document === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return loadAnalytics(
    {
      token: siteConfig.analyticsToken,
      isDev: !import.meta.env.PROD,
      doNotTrack: nav.doNotTrack ?? null,
      globalPrivacyControl: nav.globalPrivacyControl,
    },
    document,
  );
}
