import { prisma } from "../db";
import { nextOccurrence, occurrences, type Schedule } from "../recurrence";
import { today } from "../dates";
import { audit } from "../audit";

export interface TaskInput {
  title: string;
  description?: string;
  category: string;
  area?: string;
  assigneeProfileId?: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  isDeepClean?: boolean;
  schedule?: Omit<Schedule, "startDate"> | null;
}

export async function createTask(input: TaskInput, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const schedule = input.schedule && input.schedule.freq !== "NONE" && input.dueDate
      ? await tx.recurringSchedule.create({ data: { ...input.schedule, startDate: input.dueDate, dayOfMonth: input.schedule.dayOfMonth ?? null, endDate: input.schedule.endDate ?? null } })
      : null;
    const task = await tx.householdTask.create({
      data: { title: input.title, description: input.description ?? "", category: input.category, area: input.area ?? "", assigneeProfileId: input.assigneeProfileId ?? null, dueDate: input.dueDate, dueTime: input.dueTime ?? null, isDeepClean: input.isDeepClean ?? false, scheduleId: schedule?.id ?? null },
    });
    await audit({ profileId, action: "task.create", entityType: "task", entityId: task.id, summary: task.title }, tx);
    return task;
  });
}

/** Completing a recurring task logs the completion and advances to the next occurrence. */
export async function completeTask(taskId: string, profileId: string, opts: { skipped?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.householdTask.findUniqueOrThrow({ where: { id: taskId }, include: { schedule: true } });
    await tx.householdTaskCompletion.create({ data: { taskId, profileId, dueDate: task.dueDate, skipped: opts.skipped ?? false } });
    if (task.schedule && task.dueDate) {
      // Advance past today if overdue occurrences accumulated.
      let next = nextOccurrence(task.schedule, task.dueDate);
      while (next && next < today() && !opts.skipped) next = nextOccurrence(task.schedule, next);
      await tx.householdTask.update({ where: { id: taskId }, data: next ? { dueDate: next, status: "OPEN" } : { status: "DONE" } });
      return { next };
    }
    await tx.householdTask.update({ where: { id: taskId }, data: { status: "DONE" } });
    return { next: null };
  });
}

export async function reopenTask(taskId: string) {
  await prisma.householdTask.update({ where: { id: taskId }, data: { status: "OPEN" } });
}

export async function listTasks(filter: { category?: string; includeDone?: boolean } = {}) {
  return prisma.householdTask.findMany({
    where: { active: true, ...(filter.category ? { category: filter.category } : {}), ...(filter.includeDone ? {} : { status: "OPEN" }) },
    include: { schedule: true, completions: { orderBy: { completedAt: "desc" }, take: 5 } },
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
  });
}

/** Task occurrences in a date range (for the calendar), including projected recurrences. */
export async function taskOccurrences(from: string, to: string) {
  const tasks = await prisma.householdTask.findMany({ where: { active: true }, include: { schedule: true } });
  const out: { taskId: string; title: string; category: string; date: string; time: string | null; done: boolean; projected: boolean; assigneeProfileId: string | null }[] = [];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (t.status === "DONE" && !t.schedule) {
      continue;
    }
    if (t.dueDate >= from && t.dueDate <= to) out.push({ taskId: t.id, title: t.title, category: t.category, date: t.dueDate, time: t.dueTime, done: false, projected: false, assigneeProfileId: t.assigneeProfileId });
    if (t.schedule) {
      for (const d of occurrences({ ...t.schedule, startDate: t.dueDate }, from, to)) {
        if (d !== t.dueDate) out.push({ taskId: t.id, title: t.title, category: t.category, date: d, time: t.dueTime, done: false, projected: true, assigneeProfileId: t.assigneeProfileId });
      }
    }
  }
  return out;
}
