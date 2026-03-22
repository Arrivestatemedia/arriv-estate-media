import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { email, password, storedHash } = await req.json();

        if (!email || !password || !storedHash) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Hash the provided password
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Compare hashes
        const valid = hashHex === storedHash;

        return Response.json({ valid });
    } catch (error) {
        console.error('Password verification error:', error);
        return Response.json({ error: error.message || 'Verification failed' }, { status: 500 });
    }
});