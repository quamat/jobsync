import { NextRequest, NextResponse } from 'next/server';
import { fetchLinkedinJobDetailsAction } from '@/actions/linkedin.actions';
import { JOB_TYPES } from '@/models/job.model';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jobUrl = body?.jobUrl as string | undefined;

    if (!jobUrl) {
      console.warn('[import-from-url] Missing jobUrl in request body');
      return NextResponse.json(
        { error: 'jobUrl is required' },
        { status: 400 },
      );
    }

    console.info('[import-from-url] Importing job from LinkedIn URL', jobUrl);

    const details = await fetchLinkedinJobDetailsAction(jobUrl);
    console.info("[import-from-url] Job imported from LinkedIn", details);

    const mappedType = mapEmploymentTypeToJobType(details.employmentType);
    const dueDateIso = computeDueDateFromPostedTimeAgo(details.postedTimeAgo ?? "");

    // Mappa nei campi che AddJob.tsx si aspetta:
    const jobForm = {
      source: "linkedin",               // il client poi mappa al JobSource tipizzato
      title: details.title,
      type: mappedType ?? "FT",         // FT/PT/C in base a Employment type, default FT
      company: details.company,
      location: details.location,
      status: "",                       // il form mantiene lo status attuale
      dueDate: dueDateIso,              // calcolata da postedTimeAgo
      salaryRange: "1",                 // per ora default
      jobDescription: details.description,
      jobUrl: details.jobUrl,
      applied: false,
    };

    console.info("[import-from-url] Sending data to form", jobForm);

    return NextResponse.json({ jobForm });
    
  } catch (error) {
    console.error('[import-from-url] Error importing job from URL', error);
    return NextResponse.json(
      { error: 'Unable to import job details.' },
      { status: 500 },
    );
  }
}

function mapEmploymentTypeToJobType(employmentType: string): keyof typeof JOB_TYPES | undefined {
  const lower = employmentType.toLowerCase();
  if (lower.includes("full")) return "FT";
  if (lower.includes("part")) return "PT";
  if (lower.includes("contract")) return "C";
  return undefined;
}

function computeDueDateFromPostedTimeAgo(posted: string): string {
  const now = new Date();

  // default: oggi + 14 giorni
  let daysToAdd = 14;

  const m = posted.toLowerCase().match(/(\d+)\s+(day|week|month)/);
  if (m) {
    const value = parseInt(m[1], 10);
    const unit = m[2];

    let daysAgo = value;
    if (unit === "week") daysAgo = value * 7;
    if (unit === "month") daysAgo = value * 30;

    const postedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    // es: scadenza 30 giorni dopo la pubblicazione
    const due = new Date(postedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    return due.toISOString();
  }

  // fallback: oggi + 14 gg
  const fallback = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return fallback.toISOString();
}
