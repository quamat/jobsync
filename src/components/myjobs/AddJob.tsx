"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { addJob, updateJob } from "@/actions/job.actions";
import { Loader, PlusCircle } from "lucide-react";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { useCallback, useEffect, useState, useTransition } from "react";
import { AddJobFormSchema } from "@/models/addJobForm.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Company,
  JOB_TYPES,
  JobLocation,
  JobResponse,
  JobSource,
  JobStatus,
  JobTitle,
} from "@/models/job.model";
import { addDays } from "date-fns";
import { z } from "zod";
import { toast } from "../ui/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import SelectFormCtrl from "../Select";
import { DatePicker } from "../DatePicker";
import { SALARY_RANGES } from "@/lib/data/salaryRangeData";
import TiptapEditor from "../TiptapEditor";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { redirect } from "next/navigation";
import { Combobox } from "../ComboBox";
import { Resume } from "@/models/profile.model";
import CreateResume from "../profile/CreateResume";
import { getResumeList } from "@/actions/profile.actions";
import { createJobTitle } from "@/actions/jobtitle.actions";
import { createLocation } from "@/actions/job.actions";
import { addCompany } from "@/actions/company.actions";

type AddJobProps = {
  jobStatuses: JobStatus[];
  companies: Company[];
  jobTitles: JobTitle[];
  locations: JobLocation[];
  jobSources: JobSource[];
  editJob?: JobResponse | null;
  resetEditJob: () => void;
};

export function AddJob({
  jobStatuses,
  companies,
  jobTitles,
  locations,
  jobSources,
  editJob,
  resetEditJob,
}: AddJobProps) {
  const [importLoading, setImportLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof AddJobFormSchema>>({
    resolver: zodResolver(AddJobFormSchema),
    defaultValues: {
      type: Object.keys(JOB_TYPES)[0],
      dueDate: addDays(new Date(), 3),
      status: jobStatuses[0].id,
      salaryRange: "1",
      jobDescription: "",
    },
  });

  const { setValue, reset, watch, resetField } = form;

  const appliedValue = watch("applied");

  const loadResumes = useCallback(async () => {
    try {
      const resumes = await getResumeList();
      setResumes(resumes.data);
    } catch (error) {
      console.error("Failed to load resumes:", error);
    }
  }, [setResumes]);

  useEffect(() => {
    if (editJob) {
      reset(
        {
          id: editJob.id,
          userId: editJob.userId,
          title: editJob.JobTitle.id,
          company: editJob.Company.id,
          location: editJob.Location.id,
          type: editJob.jobType,
          source: editJob.JobSource.id,
          status: editJob.Status.id,
          dueDate: editJob.dueDate,
          salaryRange: editJob.salaryRange,
          jobDescription: editJob.description,
          applied: editJob.applied,
          jobUrl: editJob.jobUrl ?? undefined,
          dateApplied: editJob.appliedDate ?? undefined,
          resume: editJob.Resume?.id ?? undefined,
        },
        { keepDefaultValues: true }
      );
      setDialogOpen(true);
    }
  }, [editJob, reset]);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const setNewResumeId = (id: string) => {
    setTimeout(() => {
      setValue("resume", id);
    }, 500);
  };

  function onSubmit(data: z.infer<typeof AddJobFormSchema>) {
    startTransition(async () => {
      const { success, message } = editJob
        ? await updateJob(data)
        : await addJob(data);
      reset();
      setDialogOpen(false);
      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message,
        });
      }
      redirect("/dashboard/myjobs");
    });
    toast({
      variant: "success",
      description: `Job has been ${
        editJob ? "updated" : "created"
      } successfully`,
    });
  }

  const pageTitle = editJob ? "Edit Job" : "Add Job";

  const addJobForm = () => {
    reset();
    resetEditJob();
    setDialogOpen(true);
  };

  const jobAppliedChange = (applied: boolean) => {
    if (applied) {
      form.getValues("status") === jobStatuses[0].id &&
        setValue("status", jobStatuses[1].id);
      setValue("dateApplied", new Date());
    } else {
      resetField("dateApplied");
      setValue("status", jobStatuses[0].id);
    }
  };

  // Cerca o crea JobTitle, restituisce l'ID
  const findOrCreateJobTitleId = async (label: string): Promise<string | undefined> => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return;

    // 1. Prova a matchare tra i jobTitles passati come prop
    let found =
      jobTitles.find(t => t.value.toLowerCase() === normalized) ||
      jobTitles.find(t => t.label.toLowerCase() === normalized) ||
      jobTitles.find(t => t.label.toLowerCase().startsWith(normalized)) ||
      jobTitles.find(t => normalized.startsWith(t.label.toLowerCase())) ||
      jobTitles.find(t => t.label.toLowerCase().includes(normalized));

    if (found) {
      console.debug("[Import][JobTitle] Matched existing:", found.label);
      return found.id;
    }

    // 2. Crea il JobTitle via azione server
    try {
      console.info("[Import][JobTitle] Creating new title from label:", label);
      const created = await createJobTitle(label);
      // createJobTitle ritorna direttamente l'oggetto JobTitle
      if (created && "id" in created) {
        console.debug("[Import][JobTitle] Created:", created.id);
        jobTitles.push(created as any);
        return (created as any).id;
      }

      console.error("[Import][JobTitle] Unexpected response from createJobTitle:", created);
      toast({
        variant: "destructive",
        title: "Job Title creation failed",
        description: "Unable to create job title from imported data.",
      });
      return;
    } catch (error) {
      console.error("[Import][JobTitle] Error creating title:", error);
      toast({
        variant: "destructive",
        title: "Job Title creation failed",
        description: "Unexpected error while creating job title.",
      });
      return;
    }
  };

  // Cerca o crea Company, restituisce l'ID
  const findOrCreateCompanyId = async (label: string): Promise<string | undefined> => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return;

    // 1. Prova a matchare tra le companies passate come prop
    let found =
      companies.find(c => c.value.toLowerCase() === normalized) ||
      companies.find(c => c.label.toLowerCase() === normalized) ||
      companies.find(c => c.label.toLowerCase().startsWith(normalized)) ||
      companies.find(c => normalized.startsWith(c.label.toLowerCase())) ||
      companies.find(c => c.label.toLowerCase().includes(normalized));

    if (found) {
      console.debug("[Import][Company] Matched existing:", found.label);
      return found.id;
    }

    // 2. Crea la Company via addCompany
    try {
      console.info("[Import][Company] Creating new company from label:", label);
      const res = await addCompany({ company: label, logoUrl: "" } as any);
      if (res && res.success && res.data) {
        console.debug("[Import][Company] Created:", res.data.id);
        companies.push(res.data as any);
        return (res.data as any).id;
      }

      console.error("[Import][Company] Unexpected response from addCompany:", res);
      toast({
        variant: "destructive",
        title: "Company creation failed",
        description: "Unable to create company from imported data.",
      });
      return;
    } catch (error) {
      console.error("[Import][Company] Error creating company:", error);
      toast({
        variant: "destructive",
        title: "Company creation failed",
        description: "Unexpected error while creating company.",
      });
      return;
    }
  };

  // Cerca o crea Location, restituisce l'ID
  const findOrCreateLocationId = async (label: string): Promise<string | undefined> => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return;

    // 1. Prova a matchare tra le locations passate come prop
    let found =
      locations.find(l => l.value.toLowerCase() === normalized) ||
      locations.find(l => l.label.toLowerCase() === normalized) ||
      locations.find(l => l.label.toLowerCase().startsWith(normalized)) ||
      locations.find(l => normalized.startsWith(l.label.toLowerCase())) ||
      locations.find(l => l.label.toLowerCase().includes(normalized));

    if (found) {
      console.debug("[Import][Location] Matched existing:", found.label);
      return found.id;
    }

    // 2. Crea la Location via createLocation
    try {
      console.info("[Import][Location] Creating new location from label:", label);
      const res = await createLocation(label);
      if (res && res.success && res.data) {
        console.debug("[Import][Location] Created:", res.data.id);
        locations.push(res.data as any);
        return (res.data as any).id;
      }

      console.error("[Import][Location] Unexpected response from createLocation:", res);
      toast({
        variant: "destructive",
        title: "Location creation failed",
        description: "Unable to create location from imported data.",
      });
      return;
    } catch (error) {
      console.error("[Import][Location] Error creating location:", error);
      toast({
        variant: "destructive",
        title: "Location creation failed",
        description: "Unexpected error while creating location.",
      });
      return;
    }
  };

  const findLinkedInSourceId = (): string | undefined => {
    const found =
      jobSources.find(s => s.value.toLowerCase() === "linkedin") ||
      jobSources.find(s => s.label.toLowerCase().includes("linkedin"));

    if (found) {
      console.debug("[Import][Source] Matched LinkedIn source:", found.label);
      return found.id;
    }

    console.warn("[Import][Source] No LinkedIn source found in jobSources");
    return undefined;
  };

  const handleImportFromLinkedIn = async () => {
    const jobUrl = form.getValues("jobUrl");

    if (!jobUrl) {
      toast({
        variant: "destructive",
        title: "Missing URL",
        description: "Please paste a job URL before importing.",
      });
      return;
    }

    try {
      setImportLoading(true);
      console.log("[Import] Fetching job details from LinkedIn...");

      const res = await fetch("/api/jobs/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[Import] Error response from /api/jobs/import-from-url:", err);
        toast({
          variant: "destructive",
          title: "Import failed",
          description: err.error || "Unable to import job details.",
        });
        return;
      }

      const data = await res.json();
      const imported = data.jobForm as {
        source: string;
        title: string;
        type: string;
        company: string;
        location: string;
        status: string;
        dueDate: string;
        salaryRange: string;
        jobDescription: string;
        jobUrl: string;
        applied: boolean;
      };

      console.log("[Import] Job details imported from LinkedIn:", imported);

      // Job Title (JobTitle.id)
      if (imported.title) {
        const jobTitleId = await findOrCreateJobTitleId(imported.title);
        if (jobTitleId) {
          console.debug("[Import] Setting form.title to", jobTitleId);
          setValue("title", jobTitleId, { shouldDirty: true });
        }
      }

      // Company (Company.id)
      if (imported.company) {
        const companyId = await findOrCreateCompanyId(imported.company);
        if (companyId) {
          console.debug("[Import] Setting form.company to", companyId);
          setValue("company", companyId, { shouldDirty: true });
        }
      }

      // Location (JobLocation.id)
      if (imported.location) {
        const locationId = await findOrCreateLocationId(imported.location);
        if (locationId) {
          console.debug("[Import] Setting form.location to", locationId);
          setValue("location", locationId, { shouldDirty: true });
        }
      }

      // jobDescription
      if (imported.jobDescription) {
        console.debug("[Import] Setting jobDescription");
        setValue("jobDescription", imported.jobDescription, { shouldDirty: true });
      }

      // jobUrl
      if (imported.jobUrl) {
        console.debug("[Import] Ensuring jobUrl is set to", imported.jobUrl);
        setValue("jobUrl", imported.jobUrl, { shouldDirty: true });
      }

      // Job Source: forza LinkedIn
      const linkedInSourceId = findLinkedInSourceId();
      if (linkedInSourceId) {
        console.debug("[Import] Setting form.source to LinkedIn:", linkedInSourceId);
        setValue("source", linkedInSourceId, { shouldDirty: true });
      }

      // type: mappa Employment Type → chiave enum
      if (imported.type) {
        // const typeLower = imported.type.toLowerCase();
        // let typeKey: keyof typeof JOB_TYPES | undefined;

        // if (typeLower.includes("full")) typeKey = "FT";
        // else if (typeLower.includes("part")) typeKey = "PT";
        // else if (typeLower.includes("contract")) typeKey = "C";

        // if (typeKey) {
          console.log("[Import] Setting type to "+ imported.type);
          setValue("type", imported.type, { shouldDirty: true });
        // }
      }

      // dueDate
      if (imported.dueDate) {
        console.debug("[Import] Setting dueDate from imported.dueDate");
        setValue("dueDate", new Date(imported.dueDate), { shouldDirty: true });
      }

      toast({
        variant: "success",
        description: "Job details imported from LinkedIn.",
      });
    } catch (err) {
      console.error("[Import] Unexpected error:", err);
      toast({
        variant: "destructive",
        title: "Import error",
        description: "Unexpected error importing job details.",
      });
    } finally {
      setImportLoading(false);
    }
  };


  const closeDialog = () => setDialogOpen(false);

  const createResume = () => {
    setResumeDialogOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={addJobForm}
        data-testid="add-job-btn"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Add Job
        </span>
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogOverlay>
          <DialogContent className="h-full xl:h-[85vh] lg:h-[95vh] lg:max-w-screen-lg lg:max-h-screen overflow-y-scroll">
            <DialogHeader>
              <DialogTitle data-testid="add-job-dialog-title">
                {pageTitle}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4"
              >
                {/* Job URL */}
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="jobUrl"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-2">
                        <FormLabel>Job URL</FormLabel>
                        <div className="flex gap-2">
                          <FormControl className="flex-1">
                            <Input
                              placeholder="Copy and paste job link here"
                              {...field}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleImportFromLinkedIn}
                            disabled={importLoading}
                          >
                            {importLoading ? (
                              <>
                                <Loader className="mr-2 h-4 w-4 spinner" />
                                Importing...
                              </>
                            ) : (
                              "Import"
                            )}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Job Title */}
                <div>
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Combobox
                            options={jobTitles}
                            field={field}
                            creatable
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Company */}
                <div>
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Combobox
                            options={companies}
                            field={field}
                            creatable
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Location */}
                <div>
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Job Location</FormLabel>
                        <FormControl>
                          <Combobox
                            options={locations}
                            field={field}
                            creatable
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Job Type */}
                <div>
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="mb-2">Job Type</FormLabel>
                        <RadioGroup
                          name="type"
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex space-y-1"
                        >
                          {Object.entries(JOB_TYPES).map(([key, value]) => (
                            <FormItem
                              key={key}
                              className="flex items-center space-x-3 space-y-0"
                            >
                              <FormControl>
                                <RadioGroupItem value={key} />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {value}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Job Source */}
                <div>
                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Job Source</FormLabel>
                        <Combobox options={jobSources} field={field} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Applied */}
                <div
                  className="flex items-center"
                  data-testid="switch-container"
                >
                  <FormField
                    control={form.control}
                    name="applied"
                    render={({ field }) => (
                      <FormItem className="flex flex-row">
                        <Switch
                          id="applied-switch"
                          checked={field.value}
                          onCheckedChange={(a) => {
                            field.onChange(a);
                            jobAppliedChange(a);
                          }}
                        />
                        <FormLabel
                          htmlFor="applied-switch"
                          className="flex items-center ml-4 mb-2"
                        >
                          {field.value ? "Applied" : "Not Applied"}
                        </FormLabel>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Status */}
                <div>
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="flex flex-col [&>button]:capitalize">
                        <FormLabel>Status</FormLabel>
                        <SelectFormCtrl
                          label="Job Status"
                          options={jobStatuses}
                          field={field}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Date Applied */}
                <div className="flex flex-col">
                  <FormField
                    control={form.control}
                    name="dateApplied"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date Applied</FormLabel>
                        <DatePicker
                          field={field}
                          presets={false}
                          isEnabled={appliedValue}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Due Date */}
                <div>
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Due Date</FormLabel>
                        <DatePicker
                          field={field}
                          presets={true}
                          isEnabled={true}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Salary Range */}
                <div>
                  <FormField
                    control={form.control}
                    name="salaryRange"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Salary Range</FormLabel>
                        <FormControl>
                          <SelectFormCtrl
                            label="Salary Range"
                            options={SALARY_RANGES}
                            field={field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Resume */}
                <div className="flex items-end">
                  <FormField
                    control={form.control}
                    name="resume"
                    render={({ field }) => (
                      <FormItem className="flex flex-col [&>button]:capitalize">
                        <FormLabel>Resume</FormLabel>
                        <SelectFormCtrl
                          label="Resume"
                          options={resumes}
                          field={field}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button variant="link" type="button" onClick={createResume}>
                    Add New
                  </Button>
                  <CreateResume
                    resumeDialogOpen={resumeDialogOpen}
                    setResumeDialogOpen={setResumeDialogOpen}
                    reloadResumes={loadResumes}
                    setNewResumeId={setNewResumeId}
                  />
                </div>

                {/* Job Description */}
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="jobDescription"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel id="job-description-label">
                          Job Description
                        </FormLabel>
                        <FormControl>
                          <TiptapEditor field={field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="md:col-span-2">
                  <DialogFooter
                  // className="md:col-span
                  >
                    <div>
                      <Button
                        type="reset"
                        variant="outline"
                        className="mt-2 md:mt-0 w-full"
                        onClick={closeDialog}
                      >
                        Cancel
                      </Button>
                    </div>
                    <Button type="submit" data-testid="save-job-btn">
                      Save
                      {isPending && (
                        <Loader className="h-4 w-4 shrink-0 spinner" />
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              </form>
            </Form>
          </DialogContent>
        </DialogOverlay>
      </Dialog>
    </>
  );
}
