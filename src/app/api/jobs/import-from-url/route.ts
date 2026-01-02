// src/app/api/jobs/import-from-url/route.ts
import { NextRequest, NextResponse } from "next/server";

const BROWSEAI_ROBOT_ID = "019b7ef5-6721-73c4-baf5-1e2278f73073";

async function startBrowseAiTask(jobUrl: string) {
  console.debug("Starting Browse AI task for:", jobUrl);
  const res = await fetch(
    `https://api.browse.ai/v2/robots/${BROWSEAI_ROBOT_ID}/tasks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BROWSEAI_API_KEY!}`,
      },
      body: JSON.stringify({
        recordVideo: false,
        inputParameters: {
          linkedin_url: jobUrl,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Browse AI start error:", text);
    throw new Error(`Browse AI start error: ${res.status} ${text}`);
  }

  const json = await res.json();
  console.log("Browse AI task started:", json.result.id);
  return json.result.id as string;
}

async function waitForBrowseAiResult(taskId: string) {
  const maxAttempts = 10; // es. 10 * 5s = 50s max
  const delayMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    console.debug("Polling Browse AI task:", taskId);
    const res = await fetch(
      `https://api.browse.ai/v2/robots/${BROWSEAI_ROBOT_ID}/tasks/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BROWSEAI_API_KEY!}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Browse AI poll error:", text);
      throw new Error(`Browse AI poll error: ${res.status} ${text}`);
    }

    const json = await res.json();
    const result = json.result;
    const status = result.status as string;

    if (status === "successful") {
      console.log("Browse AI task successful:", result);
      return result;
    }

    if (status === "failed" || status === "aborted") {
      console.error("Browse AI task failed:", result);
      throw new Error(`Browse AI task failed with status: ${status}`);
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  console.error("Browse AI task timeout");
  throw new Error("Browse AI task timeout");
}

// ATTENZIONE: allinea i campi a JobForm del tuo frontend
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jobUrl = body.jobUrl as string | undefined;

    if (!jobUrl) {
      console.error("Missing jobUrl");
      return NextResponse.json(
        { error: "Missing jobUrl" },
        { status: 400 }
      );
    }

    if (!process.env.BROWSEAI_API_KEY) {
      console.error("Missing BROWSEAI_API_KEY");
      return NextResponse.json(
        { error: "Missing BROWSEAI_API_KEY" },
        { status: 500 }
      );
    }

    // 1. Avvia task su Browse AI
    const taskId = await startBrowseAiTask(jobUrl);

    // 2. Aspetta il risultato
    const result = await waitForBrowseAiResult(taskId);

    const capturedTexts = result.capturedTexts as Record<string, string>;

    // 3. Mappa capturedTexts → JobForm
    const jobForm = {
      source: "LinkedIn",
      title: capturedTexts["Job Title"] ?? "",
      type: capturedTexts["Employment Type"] ?? "",
      company: capturedTexts["Company Name"] ?? "",
      location: capturedTexts["Location"] ?? "",
      status: "To apply", // o il valore di default che usi
      dueDate: new Date().toISOString(), // frontend lo converte in Date
      dateApplied: null,
      salaryRange: "", // opzionale: puoi estrarre da Description se vuoi
      jobDescription: capturedTexts["Description"] ?? "",
      jobUrl,
      applied: false,
    };

    return NextResponse.json({ jobForm }, { status: 200 });
  } catch (e: any) {
    console.error("Import job error:", e);
    return NextResponse.json(
      { error: e.message ?? "Server error" },
      { status: 500 }
    );
  }
}
