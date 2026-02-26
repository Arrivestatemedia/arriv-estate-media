import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TRANSFER_KEYWORDS = ['transfer', 'escalate', 'speak with you', 'hand off', 'connect to', 'put through', 'give to'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { message_content } = await req.json();
    
    if (!message_content) {
      return Response.json({ error: 'Message content required' }, { status: 400 });
    }

    const lowerContent = message_content.toLowerCase();
    const hasTransferKeyword = TRANSFER_KEYWORDS.some(keyword => lowerContent.includes(keyword));

    return Response.json({ 
      shouldShowTransferButton: hasTransferKeyword,
      detectedKeyword: TRANSFER_KEYWORDS.find(keyword => lowerContent.includes(keyword))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});