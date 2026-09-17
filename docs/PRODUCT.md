# TaskFlow — Product Overview

## Vision

People have two kinds of things to do: tasks they set for themselves, and things other people hand to them. Today those live in different places — a personal to-do list, a chat thread, a verbal request, someone else's project tool. TaskFlow gives a user **one organized place for both**, without blurring the line between "something I decided to do" and "something someone asked me to do."

The feature that differentiates TaskFlow from a plain to-do list is **assignment with consent**: when someone assigns you a task, it lands in your Inbox, not your schedule. You choose to accept or decline it, and if you accept, you choose when it goes into your schedule. Your calendar is always something you curate, never something imposed on you.

## Problem

Personal to-do apps handle solo task tracking well but have no concept of receiving work from another person. Team project tools assume shared workspaces, roles, and permissions that are overkill for everyday delegation between two people. TaskFlow targets the gap between them: a strong personal task manager, plus lightweight, consent-based delegation between individuals.

## Target Users

- **Individuals managing their own workload** — the baseline use case: create tasks, prioritize, categorize, schedule, track to completion.
- **People who delegate work to specific individuals** — want to hand off a task and know whether it's been taken on, without micromanaging when it happens.
- **People who receive work from others** — want incoming requests to arrive somewhere reviewable, not silently appear on their calendar, and want to keep control of when they actually do the work.

v1 targets pairs of people who already know each other and are both TaskFlow users — not organizations, teams, or public task marketplaces.

## Core Concepts

- **Task** — a unit of work with a title, optional description, priority, category, scheduled date/time, deadline, and status.
- **Creator** — the user who originally authored a task. Fixed for the life of the task.
- **Assignee** — the user currently responsible for completing a task (who it appears on the schedule/Today view for). For a self-created task, creator and assignee are the same person. For an assigned-and-accepted task, they differ, and both remain visible on the task.
- **Assignment** — a proposal to make a specific user the assignee of a task. Has its own lifecycle (pending/accepted/declined/cancelled), independent of the task's own status.
- **Inbox** — where a user reviews assignments sent to them that are awaiting a decision.
- **Today view** — the tasks a user should be looking at today: assigned-to-them tasks scheduled for today, due today, or overdue.
- **Schedule view** — a user's tasks organized across future dates, for planning ahead.
- **Username** — a unique, public handle (e.g. `@ramikhateb`) used to find and be found by other users for collaboration. Distinct from email, which is private and used only to sign in — email is never searchable or shown to other users.

## Core User Journeys

### 1. Manage a personal task
A user creates a task for themselves with a title and any combination of description, priority, category, scheduled date/time, and deadline. They can edit, reschedule, complete, or delete it at any time. Creator and assignee are the same person throughout.

### 2. Check in on Today
A user opens the Today view and sees exactly what they should be working on: tasks scheduled for today, tasks due today, and overdue tasks — regardless of whether they created those tasks or accepted them from someone else.

### 3. Plan ahead in Schedule
A user opens the Schedule view to see and organize tasks across upcoming dates, adjusting scheduled times as priorities shift.

### 4. Find and filter tasks
A user searches their tasks by keyword and narrows the list by status, priority, or category.

### 5. Find another user
A user searches for another TaskFlow user by name or username (with or without the `@`), in order to assign them a task. Email is a private sign-in credential, never a way to find someone.

### 6. Assign a task to another user
A user creates or selects a task and assigns it to another TaskFlow user found via search. The task is not placed on the recipient's schedule — it becomes a pending assignment visible to both people, and the original assignee remains responsible for it, unchanged, while the recipient decides.

### 7. Respond to an assignment via Inbox
The recipient sees the pending assignment in their Inbox and accepts or declines it. Declining ends that assignment; the task was never taken off the sender's schedule, so nothing changes for them except being informed — they can try assigning it to someone else. Accepting is the only thing that makes the recipient the assignee, replacing the sender as the person responsible.

### 8. Schedule an accepted task
After accepting, the recipient — not the assigner — chooses the task's scheduled date/time (or leaves it unscheduled), and the deadline set by the creator carries over unchanged. The task now shows up in the recipient's Today/Schedule views like any task they own, while the original creator remains visible as its creator.

## v1 Scope

- Email/password authentication; a unique username as the separate public identity used for discovery.
- Full CRUD + complete on personal tasks, with title, description, priority, category, scheduled date/time, deadline, and status.
- Today view and Schedule view.
- Search and filter across a user's own tasks.
- Search for other users by name/username (never by email).
- Assigning a task to exactly one other user, with an Inbox for accept/decline.
- On acceptance, the assignee sets the task's scheduled date/time; the deadline persists from creation.
- Clear, persistent distinction between a task's creator and its current assignee.
- In-app visibility of assignment activity via refetch-on-focus (no push).

## Explicit Non-Goals for v1

Deferred to keep v1 focused; the data model is deliberately built so these can be added later without reworking the MVP (see [DATABASE.md](./DATABASE.md) §7). See [ROADMAP.md](./ROADMAP.md) for sequencing.

- **Recurring tasks.**
- **Push or real-time notifications** — refetch-on-focus only, no WebSockets.
- **Offline-first support.**
- **AI / smart scheduling.**
- **Chat or in-task commenting.**
- **Teams/workspaces or group task ownership** — assignment stays strictly one user to another.
- **Sub-tasks, attachments, reassignment chains beyond one active assignment at a time.**

## Success Signals

- A new user can register, create a task with a deadline, and see it in Today in under a minute.
- The full assignment round-trip (search user → assign → Inbox → accept → scheduled) completes without confusing intermediate states.
- A user can always tell, at a glance, who created a task and who is responsible for it.
- No task ever lands on a user's schedule without their explicit acceptance.
