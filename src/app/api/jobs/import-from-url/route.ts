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
    
    console.info('[import-from-url] Job imported from LinkedIn', details);

    // Mappa nei campi che AddJob.tsx si aspetta:
    // source, title, type, company, location, status, dueDate, salaryRange, jobDescription, jobUrl, applied
    const jobForm = {
      source: '', // se vuoi, setta un JobSource predefinito
      title: details.title,
      type: 'FT', // default (poi AddJob mappa FT/PT/C a JOB_TYPES)
      company: details.company,
      location: details.location,
      status: '', // lascialo vuoto, AddJob mantiene quello attuale
      dueDate: new Date().toISOString(),
      salaryRange: '1', // default
      jobDescription: details.description,
      jobUrl: details.jobUrl,
      applied: false,
    };

    return NextResponse.json({ jobForm });
  } catch (error) {
    console.error('[import-from-url] Error importing job from URL', error);
    return NextResponse.json(
      { error: 'Unable to import job details.' },
      { status: 500 },
    );
  }
}
