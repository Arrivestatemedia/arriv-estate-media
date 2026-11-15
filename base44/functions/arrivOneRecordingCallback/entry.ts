/**
 * arrivOneRecordingCallback — consent-gated recording ingest.
 *
 * Invoked by ivrSalesDialOut's Twilio recording callback, never by a browser.
 * It refuses anything that is not a Twilio-hosted recording attached to a real
 * SalesCallAttempt, so it cannot be used to pull or transcribe arbitrary audio.
 *
 * Pipeline: verify → download with Twilio credentials → store privately →
 * transcribe → AI summary → update the attempt and create CallAIAnalysis.
 * Re-running is safe: a stored recording is never downloaded twice, and a
 * transcript is never produced twice.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { loadVoiceSettings, transcriptionAllowed } from '../../shared/arrivOneSettings.ts';
import { analyzeCallText } from '../../shared/arrivOneAnalysis.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { attempt_id, recording_sid, recording_url, duration } = body || {};

    if (!attempt_id || !recording_sid) {
      return Response.json({ error: 'attempt_id and recording_sid are required' }, { status: 400 });
    }
    if (!/^RE[0-9a-zA-Z]{10,}$/.test(String(recording_sid))) {
      return Response.json({ error: 'Not a Twilio recording.' }, { status: 400 });
    }
    if (recording_url && !/^https:\/\/api\.twilio\.com\//.test(String(recording_url))) {
      return Response.json({ error: 'Recording must be hosted by Twilio.' }, { status: 400 });
    }

    const attempts = listOf(
      await base44.asServiceRole.entities.SalesCallAttempt.filter({ attempt_id }, { limit: 1 }).catch(() => [])
    );
    const attempt = attempts[0];
    if (!attempt) return Response.json({ error: 'No such call attempt.' }, { status: 404 });

    const settings = await loadVoiceSettings(base44);

    if (!transcriptionAllowed(settings, attempt.recording_consent)) {
      await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, {
        recording_status: attempt.recording_uri ? 'stored' : 'none',
        transcript_status: 'none',
        summary_status: 'none',
      }).catch(() => {});
      return Response.json({
        skipped: true,
        reason:
          attempt.recording_consent === 'consented'
            ? 'Recording or transcription is switched off for this organization.'
            : 'Consent was not established for this call.',
      });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return Response.json({ error: 'Twilio credentials are not configured.' }, { status: 500 });
    }
    const auth = `Basic ${btoa(`${accountSid}:${authToken}`)}`;

    // 1. Store the recording privately, once.
    let fileUri = attempt.recording_uri || '';
    if (!fileUri) {
      const sourceUrl = `${String(recording_url || '').replace(/\.json$/, '')}.mp3`;
      if (!sourceUrl.startsWith('https://api.twilio.com/')) {
        return Response.json({ error: 'Recording URL was not supplied.' }, { status: 400 });
      }
      const download = await fetch(sourceUrl, {
        headers: { Authorization: auth, Accept: 'audio/mpeg' },
      });
      if (!download.ok) {
        await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, { recording_status: 'failed' }).catch(() => {});
        return Response.json({ error: 'Twilio did not return the recording.' }, { status: 502 });
      }
      const bytes = new Uint8Array(await download.arrayBuffer());
      const file = new File([bytes], `${recording_sid}.mp3`, { type: 'audio/mpeg' });
      const uploaded: any = await base44.integrations.Core.UploadPrivateFile({ file });
      fileUri = uploaded?.file_uri || '';
      if (!fileUri) {
        await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, { recording_status: 'failed' }).catch(() => {});
        return Response.json({ error: 'The recording could not be stored.' }, { status: 500 });
      }
      await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, {
        recording_sid,
        recording_uri: fileUri,
        recording_status: 'stored',
        transcript_status: 'pending',
        summary_status: 'pending',
      });
    }

    // 2. Transcribe (skipped when a transcript already exists).
    let transcript = '';
    const existing = listOf(
      await base44.asServiceRole.entities.CallAIAnalysis.filter({ attempt_id }, { limit: 1 }).catch(() => [])
    )[0];
    if (existing?.transcript) {
      transcript = existing.transcript;
    } else {
      const signed: any = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 900 });
      if (!signed?.signed_url) {
        await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, { transcript_status: 'failed' }).catch(() => {});
        return Response.json({ error: 'A playback link for the recording could not be created.' }, { status: 500 });
      }
      try {
        const text: any = await base44.integrations.Core.TranscribeAudio({ audio_url: signed.signed_url });
        transcript = String(text || '').trim();
      } catch (error: any) {
        await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, { transcript_status: 'failed' }).catch(() => {});
        return Response.json({ error: `Transcription failed: ${error?.message || 'unknown error'}` }, { status: 502 });
      }
      await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, {
        transcript_status: transcript ? 'ready' : 'failed',
      }).catch(() => {});
    }

    if (!transcript) {
      return Response.json({ error: 'No speech could be transcribed from that recording.' }, { status: 422 });
    }

    // 3. Structured summary + coaching, grounded in the transcript only.
    let analysis: any = null;
    if (settings.ai_summaries_enabled !== false) {
      analysis = await analyzeCallText(base44, {
        source: 'recording',
        text: transcript,
        prospect: attempt.prospect_name || attempt.destination,
        rep: attempt.rep_name || '',
      });
    }

    const payload = {
      attempt_id,
      call_sid: attempt.call_sid || '',
      activity_id: attempt.activity_id || '',
      contact_id: attempt.contact_id || '',
      prospect_name: attempt.prospect_name || '',
      rep_id: attempt.rep_id,
      rep_name: attempt.rep_name || '',
      source: 'recording',
      transcript,
      transcript_confidence: analysis?.uncertainty?.length ? 0.7 : 0.9,
      speaker_labels_reliable: analysis?.speaker_labels_reliable === true,
      summary: analysis?.summary || '',
      objections: analysis?.objections || [],
      services_discussed: analysis?.services_discussed || [],
      package_interest: analysis?.package_interest || '',
      requested_info: analysis?.requested_info || [],
      follow_up_commitments: analysis?.follow_up_commitments || [],
      suggested_outcome: analysis?.suggested_outcome || '',
      suggested_next_steps: analysis?.suggested_next_steps || [],
      suggested_lead_status: analysis?.suggested_lead_status || '',
      coaching: settings.coaching_enabled === false ? {} : analysis?.coaching || {},
      status: 'ready',
      created_at: new Date().toISOString(),
    };

    const record = existing
      ? await base44.asServiceRole.entities.CallAIAnalysis.update(existing.id, payload)
      : await base44.asServiceRole.entities.CallAIAnalysis.create(payload);

    await base44.asServiceRole.entities.SalesCallAttempt.update(attempt.id, {
      summary_status: 'ready',
      recording_status: 'stored',
      transcript_status: 'ready',
      duration_seconds: Number(attempt.duration_seconds || duration || 0),
    }).catch(() => {});

    return Response.json({
      success: true,
      analysis_id: record.id,
      transcript_chars: transcript.length,
      uncertainty: analysis?.uncertainty || [],
    });
  } catch (error: any) {
    console.error('arrivOneRecordingCallback failed:', error);
    return Response.json({ error: error?.message || 'Recording processing failed.' }, { status: 500 });
  }
});