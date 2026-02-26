Deno.serve(async (req) => {
  try {
    const { messageContent } = await req.json();
    
    if (!messageContent) {
      return Response.json({ hasKeywords: false });
    }

    const text = messageContent.toLowerCase();
    const keywords = [
      'transfer',
      'escalate',
      'speak with',
      'talk to',
      'let me transfer',
      'let me get',
      'one moment',
      'connecting you',
      'putting you through',
      'hand off',
      'pass to',
      'give to'
    ];

    const hasKeywords = keywords.some(keyword => text.includes(keyword));

    return Response.json({ hasKeywords });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});