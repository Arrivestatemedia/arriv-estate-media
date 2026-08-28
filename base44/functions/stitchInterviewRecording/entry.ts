import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { conferenceId } = body;

    if (!conferenceId) {
      return Response.json({ error: "conferenceId is required" }, { status: 400 });
    }

    const conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    // Find local recording parts (browser webm files, not Tavus S3)
    const recsRes = await base44.asServiceRole.entities.VideoRecording.filter(
      { room_name: conference.room_name },
      "created_date",
      20
    );
    const allRecs = recsRes?.data ?? recsRes ?? [];
    const localParts = allRecs
      .filter(r => (r.file_url || "").includes("part") && (r.file_url || "").endsWith(".webm"))
      .sort((a, b) => {
        const aPart = parseInt((a.file_url.match(/part(\d+)/) || [])[1] || "0");
        const bPart = parseInt((b.file_url.match(/part(\d+)/) || [])[1] || "0");
        return aPart - bPart;
      });

    if (localParts.length < 2) {
      return Response.json({ error: "Need at least 2 local parts to stitch", partsFound: localParts.length }, { status: 400 });
    }

    // Download each part and concatenate bytes (same-codec MediaRecorder webm
    // segments concatenate cleanly at the byte level for playback)
    const buffers: ArrayBuffer[] = [];
    let totalDuration = 0;
    for (const part of localParts) {
      const resp = await fetch(part.file_url);
      if (!resp.ok) throw new Error(`Failed to download ${part.file_url}: ${resp.status}`);
      const buf = await resp.arrayBuffer();
      buffers.push(buf);
      totalDuration += part.duration_seconds || 0;
    }

    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const stitched = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      stitched.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    const stitchedBlob = new Blob([stitched], { type: "video/webm" });
    const stitchedFile = new File([stitchedBlob], `stitched-${conference.room_name}.webm`, { type: "video/webm" });

    // Upload the stitched file
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: stitchedFile as any });
    const stitchedUrl = (uploadRes as any).file_url;

    // Update the conference to use the stitched recording as primary
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      recording_url: stitchedUrl,
      recording_status: "ready",
      recording_duration_seconds: totalDuration || null,
    });

    // Create a VideoRecording for the stitched file
    const participant = conference.participants?.[0];
    await base44.asServiceRole.entities.VideoRecording.create({
      file_url: stitchedUrl,
      duration_seconds: totalDuration,
      file_size: totalLength,
      recorded_by_id: conference.organizer_id || null,
      recorded_by_name: "Local Recording (Stitched)",
      participant_name: participant?.name || conference.title || "",
      room_name: conference.room_name,
    });

    // Update HireCandidate documents: replace old part refs with stitched
    if (participant?.email) {
      const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
        { email: participant.email },
        "-created_date",
        5
      );
      const candidates = candRes?.data ?? candRes ?? [];
      const candidate = Array.isArray(candidates) ? candidates[0] : null;
      if (candidate) {
        const existingDocs = Array.isArray(candidate.documents) ? candidate.documents : [];
        const partUrls = localParts.map(p => p.file_url);
        const filteredDocs = existingDocs.filter(d => !partUrls.includes(d?.url));
        const alreadyHas = filteredDocs.some(d => d?.url === stitchedUrl);
        if (!alreadyHas) {
          filteredDocs.push({
            type: "interview_recording",
            url: stitchedUrl,
            label: `Interview Recording (Stitched, ${Math.floor(totalDuration / 60)}:${String(totalDuration % 60).padStart(2, "0")})`,
            conference_id: conference.id,
            created_at: new Date().toISOString(),
          });
        }
        await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
          documents: filteredDocs,
        });
      }
    }

    return Response.json({
      status: "success",
      stitched_url: stitchedUrl,
      total_duration_seconds: totalDuration,
      parts_stitched: localParts.length,
    });
  } catch (error) {
    console.error("stitchInterviewRecording error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});