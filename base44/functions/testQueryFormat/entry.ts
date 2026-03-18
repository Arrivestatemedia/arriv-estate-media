Deno.serve(async (req) => {
    try {
        const appId = Deno.env.get('BASE44_APP_ID');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`
        };

        // Try different query formats
        const formats = [
            `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=BradCBurke91%40gmail.com`,
            `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?query={"email":"BradCBurke91@gmail.com"}`,
        ];

        const results = [];
        for (const url of formats) {
            const resp = await fetch(url, { headers }).catch(e => ({ error: e.message }));
            results.push({
                url: url.split('?')[1],
                status: resp.status,
                ok: resp.ok,
                data: resp.ok ? await resp.json().catch(() => 'parse error') : 'failed'
            });
        }

        return Response.json({ results });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});