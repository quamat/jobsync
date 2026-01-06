'use server';

import prisma from "@/lib/db";

const APIFY_PROVIDER = 'apify-linkedin-job-details';
const CACHE_TTL_DAYS = 7;

// Endpoint base run actor (start + wait)
const APIFY_RUN_URL =
  'https://api.apify.com/v2/acts/piotrv1001~linkedin-job-details-scraper/runs';

// Endpoint per leggere run e dataset
const APIFY_RUN_DETAIL_URL = 'https://api.apify.com/v2/runs';
const APIFY_DATASET_ITEMS_URL = 'https://api.apify.com/v2/datasets';

type ApifyLinkedinJobDetailsItem = {
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobLocation?: string;
  postedTimeAgo?: string;
  numApplicantsCaption?: string;
  description?: string;
  peopleAlsoViewed?: {
    jobLink?: string;
    jobTitle?: string;
    companyName?: string;
    jobLocation?: string;
    postedTimeAgo?: string;
  }[];
  similarJobs?: {
    jobLink?: string;
    jobTitle?: string;
    companyName?: string;
    jobLocation?: string;
    postedTimeAgo?: string;
  }[];
};

type LinkedinFormData = {
  title: string;
  company: string;
  location: string;
  description: string;
  jobUrl: string;
};

function computeExpiresAt(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function mapApifyItemToForm(
  item: ApifyLinkedinJobDetailsItem,
  url: string,
): LinkedinFormData {
  return {
    title: item.jobTitle ?? '',
    company: item.companyName ?? '',
    location: item.jobLocation ?? '',
    description: item.description ?? '',
    jobUrl: url,
  };
}

function getApifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('[fetchLinkedinJobDetailsAction] Missing APIFY_TOKEN');
    throw new Error('APIFY_TOKEN not configured');
  }
  return token;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[fetchJson] HTTP error', { url, status: res.status, text });
    throw new Error(`HTTP error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Prova a usare una run/dataset esistenti (se presenti in cache)
 * per evitare di rilanciare lo scraping.
 */
async function hydrateFromExistingRun(
  url: string,
  runId: string | null,
  datasetId: string | null,
): Promise<LinkedinFormData | null> {
  if (!runId || !datasetId) return null;

  const token = getApifyToken();

  console.info('[fetchLinkedinJobDetailsAction] Checking existing Apify run', {
    url,
    runId,
    datasetId,
  });

  type RunDetail = {
    id: string;
    status: string;
    defaultDatasetId?: string;
  };

  const runDetail = await fetchJson<{ data: RunDetail }>(
    `${APIFY_RUN_DETAIL_URL}/${runId}?token=${token}`,
  );

  if (!runDetail?.data) {
    console.warn('[fetchLinkedinJobDetailsAction] Run not found on Apify', {
      url,
      runId,
    });
    return null;
  }

  if (runDetail.data.status !== 'SUCCEEDED') {
    console.info('[fetchLinkedinJobDetailsAction] Run not finished yet', {
      url,
      runId,
      status: runDetail.data.status,
    });
    return null;
  }

  const items = await fetchJson<ApifyLinkedinJobDetailsItem[]>(
    `${APIFY_DATASET_ITEMS_URL}/${datasetId}/items?token=${token}`,
  );

  const firstItem = (items[0] ?? {}) as ApifyLinkedinJobDetailsItem;

  if (!firstItem || !firstItem.jobTitle) {
    console.warn(
      '[fetchLinkedinJobDetailsAction] Dataset empty or unusable for completed run',
      { url, runId },
    );
    return null;
  }

  const expiresAt = computeExpiresAt(CACHE_TTL_DAYS);

  await prisma.jobScrapeCache.upsert({
    where: { url },
    create: {
      url,
      provider: APIFY_PROVIDER,
      responseJson: JSON.stringify(firstItem),
      apifyRunId: runId,
      datasetId,
      expiresAt,
    },
    update: {
      responseJson: JSON.stringify(firstItem),
      expiresAt,
    },
  });

  console.info('[fetchLinkedinJobDetailsAction] Cache hydrated from existing run', {
    url,
    runId,
  });

  return mapApifyItemToForm(firstItem, url);
}

/**
 * Server action invocata da /api/jobs/import-from-url
 */
export async function fetchLinkedinJobDetailsAction(
  jobUrl: string,
): Promise<LinkedinFormData> {
  if (!jobUrl) {
    console.warn('[fetchLinkedinJobDetailsAction] Missing jobUrl');
    throw new Error('Missing jobUrl');
  }

  const now = new Date();

  // 1) Cache lookup
  const cached = await prisma.jobScrapeCache.findUnique({
    where: { url: jobUrl },
  });

  if (cached && cached.provider === APIFY_PROVIDER && cached.expiresAt > now) {
    console.info('[fetchLinkedinJobDetailsAction] Cache hit for URL', jobUrl);
    const item = JSON.parse(cached.responseJson) as ApifyLinkedinJobDetailsItem;
    return mapApifyItemToForm(item, jobUrl);
  }

  console.info('[fetchLinkedinJobDetailsAction] Cache miss/expired for URL', jobUrl, {
    hasCached: !!cached,
  });

  // 2) Prova prima a riusare run/dataset esistente
  if (cached && (cached.apifyRunId || cached.datasetId)) {
    const hydrated = await hydrateFromExistingRun(
      jobUrl,
      cached.apifyRunId,
      cached.datasetId,
    );
    if (hydrated) return hydrated;
  }

  // 3) Lancia nuova run via HTTP
  const token = getApifyToken();

  console.info('[fetchLinkedinJobDetailsAction] Starting new Apify run for URL', jobUrl);

  type StartRunResponse = {
    data: {
      id: string;
      status: string;
      defaultDatasetId?: string;
      // altre proprietà ignorate
    };
  };

  const startRunBody = {
    searchUrls: [jobUrl],
  };

  // waitForFinish per avere direttamente i risultati (se finiscono entro il timeout)
  const startRunUrl = `${APIFY_RUN_URL}?token=${token}&waitForFinish=120`;

  const runResp = await fetchJson<StartRunResponse>(startRunUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(startRunBody),
  });

  const run = runResp.data;
  console.info('[fetchLinkedinJobDetailsAction] Apify run response', {
    url: jobUrl,
    runId: run.id,
    status: run.status,
    datasetId: run.defaultDatasetId,
  });

  const datasetId = run.defaultDatasetId;
  if (!datasetId) {
    console.error('[fetchLinkedinJobDetailsAction] Missing defaultDatasetId in run', {
      url: jobUrl,
      runId: run.id,
    });
    throw new Error('Apify run missing dataset');
  }

  const items = await fetchJson<ApifyLinkedinJobDetailsItem[]>(
    `${APIFY_DATASET_ITEMS_URL}/${datasetId}/items?token=${token}`,
  );

  console.debug('[fetchLinkedinJobDetailsAction] Apify run items response', items);

  const firstItem = (items[0] ?? {}) as ApifyLinkedinJobDetailsItem;

  if (!firstItem || !firstItem.jobTitle) {
    console.warn(
      '[fetchLinkedinJobDetailsAction] No useful data returned from Apify for URL',
      jobUrl,
    );
    throw new Error('No data from Apify');
  }

  const expiresAt = computeExpiresAt(CACHE_TTL_DAYS);

  await prisma.jobScrapeCache.upsert({
    where: { url: jobUrl },
    create: {
      url: jobUrl,
      provider: APIFY_PROVIDER,
      responseJson: JSON.stringify(firstItem),
      apifyRunId: run.id,
      datasetId,
      expiresAt,
    },
    update: {
      provider: APIFY_PROVIDER,
      responseJson: JSON.stringify(firstItem),
      apifyRunId: run.id,
      datasetId,
      expiresAt,
    },
  });

  console.info('[fetchLinkedinJobDetailsAction] Cache updated after new run', {
    url: jobUrl,
    runId: run.id,
  });

  return mapApifyItemToForm(firstItem, jobUrl);
}
