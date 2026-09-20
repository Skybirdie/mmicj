# SkyReader180 — Phase 3.8

## Purpose

Attempted fix for the recurring cold-launch problem observed after updating
the project files.

## Changes

- Added a single-flight opening transaction to `SRNavigation`.
- Added a Reader-level single-flight guard so the same publication cannot be
  opened twice while its PDF/flip engine is initializing.
- Added a presentation-generation token to `Renderer` so late asynchronous
  work from an obsolete open cannot modify the current viewer.
- Preserved the Phase 3.7 behavior for final-spread closing, Continue Reading,
  changing books, resume positions, page indicators, and keyboard navigation.

## Deferred

The cover-to-first-spread visual gap remains unchanged.
