/**
 * ivrEngine — Twilio voice webhook for the configuration-driven flow runtime.
 *
 * The engine resolves the published flow from the database on every call, so a
 * published greeting, menu, voice or destination is live for the next call with
 * no Base44 deployment. Numbers with no published flow keep using the existing
 * production routing, which this function redirects to unchanged.
 *
 * Retry note: deployment retried after a bundler transport error.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { secrets } from 'base44:runtime';
import { handleIvrRequest } from '../../shared/ivrRuntime.ts';

Deno.serve((req) => handleIvrRequest(req, createClientFromRequest(req), secrets));