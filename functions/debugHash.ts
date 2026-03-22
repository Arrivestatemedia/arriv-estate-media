Deno.serve(async (req) => {
    const { password } = await req.json();
    
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return Response.json({ hash: hashHex });
});