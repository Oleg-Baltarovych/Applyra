// Drift guard: every enum mirrored in @applyra/contracts must have exactly the value set of the Prisma enum it
// mirrors; ApplicationStatus also the order (it is the pipeline / Kanban column order, FR-APP-03) (06 §1: enum values are the same in contracts and Prisma). Lives here because contracts cannot
// import the generated client.
import * as contracts from '@applyra/contracts';
import { describe, expect, it } from 'vitest';
import * as prisma from '../src/platform/prisma/generated/enums.js';

const mirrored = {
  WorkMode: [contracts.WorkMode, prisma.WorkMode],
  EmploymentType: [contracts.EmploymentType, prisma.EmploymentType],
  Seniority: [contracts.Seniority, prisma.Seniority],
  SalaryPeriod: [contracts.SalaryPeriod, prisma.SalaryPeriod],
  CefrLevel: [contracts.CefrLevel, prisma.CefrLevel],
  JobVisibility: [contracts.JobVisibility, prisma.JobVisibility],
  JobStatus: [contracts.JobStatus, prisma.JobStatus],
  ExtractionMethod: [contracts.ExtractionMethod, prisma.ExtractionMethod],
  ApplicationStatus: [contracts.ApplicationStatus, prisma.ApplicationStatus],
  ApplicationOrigin: [contracts.ApplicationOrigin, prisma.ApplicationOrigin],
  ApplicationChannel: [contracts.ApplicationChannel, prisma.ApplicationChannel],
  Priority: [contracts.Priority, prisma.Priority],
  ApplicationEventType: [contracts.ApplicationEventType, prisma.ApplicationEventType],
  EventActor: [contracts.EventActor, prisma.EventActor],
  ReminderKind: [contracts.ReminderKind, prisma.ReminderKind],
  ReminderSource: [contracts.ReminderSource, prisma.ReminderSource],
  ReminderStatus: [contracts.ReminderStatus, prisma.ReminderStatus],
} as const;

/** Prisma enums deliberately not in contracts yet (never on the wire in R0 / owned by a later task). */
const notMirrored = ['Role', 'NotificationChannel', 'ImportStatus'];

describe('contracts ↔ Prisma enums', () => {
  it.each(Object.entries(mirrored))('%s has the same values', (_name, [schema, dbEnum]) => {
    expect([...schema.options].sort()).toEqual(Object.values(dbEnum).sort());
  });

  it('ApplicationStatus keeps the pipeline order of the DB enum', () => {
    expect(contracts.ApplicationStatus.options).toEqual(Object.values(prisma.ApplicationStatus));
  });

  it('every Prisma enum is mirrored or explicitly listed as not mirrored', () => {
    const prismaEnums = Object.keys(prisma).sort();
    expect([...Object.keys(mirrored), ...notMirrored].sort()).toEqual(prismaEnums);
  });
});
