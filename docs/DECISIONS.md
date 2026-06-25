# Decisions

## 2026-06-24: Keep Current UI Shape During Backend Migration

The React UI currently works against one full trip object. During the Supabase transition, backend code should adapt normalized tables back into that shape before forcing UI changes.

Reason: this keeps the migration incremental and reduces the chance of breaking the existing planner while the backend is introduced.

## 2026-06-24: Preserve JSON Export/Import

JSON export/import remains useful even after Supabase is added.

Reason: it gives the project a simple backup, migration, and debugging path while shared persistence is being built.

## 2026-06-24: Use Supabase With RLS From The Start

Persistent Supabase tables should ship with RLS enabled and membership policies in place before real trip data is stored there.

Reason: the planner may contain private travel details, reservations, links, and notes.

## 2026-06-24: Keep Supabase Access Behind A Data Layer

Supabase reads and writes should live behind focused modules in `src/lib/` instead of being embedded throughout `src/App.jsx`.

Reason: this keeps UI state management understandable and leaves room for local fallback, migration, and testing.
