import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const url = new URL(req.url);
        const userId = url.searchParams.get('user_id');

        if (!userId) {
            return new Response(
                '<html><body><h1>Invalid Request</h1><p>Missing user ID</p></body></html>',
                { status: 400, headers: { 'Content-Type': 'text/html' } }
            );
        }

        // Delete the user account immediately
        await base44.asServiceRole.entities.User.delete(userId);

        return new Response(
            '<html><body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; text-align: center;"><h1 style="color: #22c55e;">✓ Account Deleted</h1><p>The user account has been permanently deleted.</p></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
    } catch (error) {
        return new Response(
            `<html><body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; text-align: center;"><h1 style="color: #ef4444;">Error</h1><p>${error.message}</p></body></html>`,
            { status: 500, headers: { 'Content-Type': 'text/html' } }
        );
    }
});