import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, photoUrl } = await req.json();

    if (!jobId || !photoUrl) {
      return Response.json({ error: 'Job ID and photo URL are required' }, { status: 400 });
    }

    // Use AI to verify the attire
    const verificationPrompt = `Analyze this photo and verify if the person is wearing ARRIV-branded attire. 
    
They should be wearing EITHER:
1. A cream/white colored ARRIV shirt with the ARRIV logo visible on the left chest area, OR
2. A black ARRIV jacket with the ARRIV logo visible on the left chest (the cream/white ARRIV shirt should be visible underneath), AND khaki pants

Look specifically for:
- The ARRIV logo/branding on the left side of the chest
- Appropriate clothing color and style
- In the case of the jacket, khaki-colored pants

If the attire is verified, respond with: {"verified": true}
If the attire is not verified, respond with: {"verified": false, "reason": "specific reason why"}`;

    const aiResult = await base44.integrations.Core.InvokeLLM({
      prompt: verificationPrompt,
      file_urls: [photoUrl],
      response_json_schema: {
        type: "object",
        properties: {
          verified: {
            type: "boolean",
            description: "Whether the attire is verified"
          },
          reason: {
            type: "string",
            description: "Reason if not verified"
          }
        },
        required: ["verified"]
      }
    });

    const verified = aiResult.verified === true;
    const message = verified 
      ? "Attire verified successfully" 
      : aiResult.reason || "Please ensure you are wearing ARRIV-branded attire with the logo visible on the left chest.";

    return Response.json({
      verified,
      message
    });
  } catch (error) {
    console.error('Error verifying attire:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});