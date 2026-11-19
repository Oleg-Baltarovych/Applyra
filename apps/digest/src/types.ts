/** Work mode as stated by the posting; `unknown` when the source does not say. */
export type RemoteMode = 'remote' | 'hybrid' | 'office' | 'unknown';

export type Currency = 'USD' | 'EUR' | 'UAH';

/** Monthly salary. `min` only = "від/from $X", `max` only = "до/up to $X". */
export interface Salary {
  min?: number;
  max?: number;
  currency: Currency;
}

/** One vacancy after normalization — the only shape the pipeline works with. */
export interface Vacancy {
  /** Stable id: `<source>:<source-specific id or url hash>`. */
  id: string;
  source: string;
  /** Canonical url (see normalize/url.ts). */
  url: string;
  title: string;
  /** Empty string when unknown. */
  company: string;
  salary?: Salary;
  location: { cities: string[]; remote: RemoteMode };
  /** Required years of experience, when the source states it as a field. */
  experienceYears?: number;
  publishedAt: Date;
  description?: string;
}

/** What a source adapter returns: loosely typed text fields, validated by normalize(). */
export interface RawItem {
  source: string;
  url: string;
  title: string;
  /** Source-specific stable id (e.g. the numeric id in a DOU link); falls back to a url hash. */
  sourceId?: string;
  company?: string;
  salary?: string;
  location?: string;
  experience?: string;
  publishedAt?: string;
  description?: string;
}
